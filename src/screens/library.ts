// Library Browser Screen

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type RenderContext,
  type KeyEvent,
} from "@opentui/core"
import { JellyfinClient, type JellyfinItem } from "../api/jellyfin"
import { theme } from "../utils/theme"
import { strings } from "../utils/strings"
import { debug } from "../utils/debug"
import { MediaList } from "../components/media-list"

export type LibraryAction =
  | { type: "open-item"; item: JellyfinItem }
  | { type: "back" }

export class LibraryScreen {
  private renderer: RenderContext
  private container: BoxRenderable
  private mediaList: MediaList | null = null
  private onAction: (action: LibraryAction) => void
  private keyHandler: (key: KeyEvent) => void
  private destroyed = false
  private loadGeneration = 0

  constructor(
    renderer: RenderContext,
    client: JellyfinClient,
    library: JellyfinItem,
    onAction: (action: LibraryAction) => void
  ) {
    this.renderer = renderer
    this.onAction = onAction

    debug("library", `LibraryScreen created for "${library.Name}"`, { id: library.Id })

    this.container = new BoxRenderable(renderer, {
      id: "library-screen",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    // Header
    const header = new BoxRenderable(renderer, {
      id: "library-header",
      flexDirection: "row",
      alignItems: "center",
      paddingX: 2,
      paddingY: 1,
      gap: 2,
    })
    const backBtn = new BoxRenderable(renderer, {
      id: "library-back-btn",
      onMouseDown: () => this.onAction({ type: "back" }),
    })
    backBtn.add(new TextRenderable(renderer, {
      id: "library-back",
      content: "← ",
      fg: theme.text.muted,
    }))
    header.add(backBtn)
    header.add(new TextRenderable(renderer, {
      id: "library-title",
      content: library.Name,
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    }))
    this.container.add(header)

    // Loading text while fetching
    const loadingBox = new BoxRenderable(renderer, {
      id: "library-loading-box",
      flexGrow: 1,
      paddingX: 2,
    })
    loadingBox.add(new TextRenderable(renderer, {
      id: "library-loading",
      content: strings.library.loading,
      fg: theme.status.success,
    }))
    this.container.add(loadingBox)

    // Hint bar
    this.container.add(new TextRenderable(renderer, {
      id: "library-hint",
      content: strings.library.hint,
      attributes: TextAttributes.DIM,
      fg: theme.text.muted,
    }))

    // Back key handler (before MediaList takes over)
    this.keyHandler = (key: KeyEvent) => {
      if (!this.mediaList && (key.name === "escape" || key.name === "backspace")) {
        this.onAction({ type: "back" })
      }
    }
    renderer.keyInput.on("keypress", this.keyHandler)

    // Load items then build MediaList
    this.loadItems(client, library.Id, loadingBox)
  }

  private async loadItems(client: JellyfinClient, parentId: string, loadingBox: BoxRenderable) {
    const generation = ++this.loadGeneration
    try {
      const data = await client.getItems(parentId, {
        sortBy: "SortName",
        sortOrder: "Ascending",
      })

      if (this.destroyed || generation !== this.loadGeneration || this.container.isDestroyed) {
        debug("library", "Ignoring stale loadItems success")
        return
      }

      debug("library", `Loaded ${data.Items.length} items`)

      this.container.remove("library-loading-box")
      loadingBox.destroy()

      if (data.Items.length === 0) {
        const contentBox = new BoxRenderable(this.renderer, { id: "library-empty-box", flexGrow: 1, paddingX: 2 })
        contentBox.add(new TextRenderable(this.renderer, {
          id: "library-empty",
          content: strings.library.empty,
          fg: theme.text.muted,
        }))
        this.container.add(contentBox)
        return
      }

      const mediaListBox = new BoxRenderable(this.renderer, {
        id: "library-content",
        flexGrow: 1,
        flexDirection: "column",
        paddingX: 2,
        overflow: "hidden",
      })

      this.mediaList = new MediaList(this.renderer, {
        id: "library",
        items: data.Items,
        client,
        formatName: (item) => {
          if (item.Type === "Movie") return `${item.Name}${item.ProductionYear ? ` (${item.ProductionYear})` : ""}`
          return item.Name
        },
        formatDesc: (item) => {
          const parts: string[] = []
          if (item.CommunityRating) parts.push(strings.common.rating(item.CommunityRating))
          if (item.ProductionYear) parts.push(strings.detail.year(item.ProductionYear))
          if (item.UserData?.Played) parts.push(strings.common.played)
          else if (item.UserData?.PlayedPercentage) parts.push(strings.common.watched(item.UserData.PlayedPercentage))
          return parts.join(" · ")
        },
        onSelect: (item) => this.onAction({ type: "open-item", item }),
        onBack: () => this.onAction({ type: "back" }),
      })

      mediaListBox.add(this.mediaList.getRenderable())
      this.container.add(mediaListBox, 1) // insert after header, before hint
    } catch (err) {
      if (this.destroyed || generation !== this.loadGeneration || this.container.isDestroyed) {
        debug("library", "Ignoring stale loadItems error", { error: String(err) })
        return
      }
      debug("library", "Failed to load items", { error: String(err) })
      this.container.remove("library-loading-box")
      loadingBox.destroy()
      const errBox = new BoxRenderable(this.renderer, { id: "library-error-box", flexGrow: 1, paddingX: 2 })
      errBox.add(new TextRenderable(this.renderer, {
        id: "library-error",
        content: strings.library.loadError(err instanceof Error ? err.message : "Unknown error"),
        fg: theme.status.error,
      }))
      this.container.add(errBox)
    }
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  destroy() {
    debug("library", "LibraryScreen destroyed")
    this.destroyed = true
    this.loadGeneration++
    this.renderer.keyInput.off("keypress", this.keyHandler)
    this.mediaList?.destroy()
    this.container.destroy()
  }
}
