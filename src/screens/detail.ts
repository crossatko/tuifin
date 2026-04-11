// Detail Screen — two-panel layout using MediaList component

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

export type DetailAction =
  | { type: "open-item"; item: JellyfinItem }
  | { type: "play"; item: JellyfinItem }
  | { type: "back" }

export class DetailScreen {
  private renderer: RenderContext
  private client: JellyfinClient
  private container: BoxRenderable
  private item: JellyfinItem
  private onAction: (action: DetailAction) => void
  private keyHandler: (key: KeyEvent) => void = () => {}
  private mediaList: MediaList | null = null

  constructor(
    renderer: RenderContext,
    client: JellyfinClient,
    item: JellyfinItem,
    onAction: (action: DetailAction) => void
  ) {
    this.renderer = renderer
    this.client = client
    this.item = item
    this.onAction = onAction

    debug("detail", `DetailScreen created for "${item.Name}" (${item.Type})`, { id: item.Id })

    this.container = new BoxRenderable(renderer, {
      id: "detail-screen",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      paddingBottom: 1,
    })

    // For playable items, play immediately
    if (this.isPlayable(item)) {
      this.onAction({ type: "play", item })
      return
    }

    // Header
    const header = new BoxRenderable(renderer, {
      id: "detail-header",
      flexDirection: "row",
      alignItems: "center",
      paddingX: 2,
      paddingY: 1,
      gap: 2,
    })
    const backBtn = new BoxRenderable(renderer, {
      id: "detail-back-btn",
      onMouseDown: () => this.onAction({ type: "back" }),
    })
    backBtn.add(new TextRenderable(renderer, {
      id: "detail-back",
      content: "← ",
      fg: theme.text.muted,
    }))
    header.add(backBtn)
    header.add(new TextRenderable(renderer, {
      id: "detail-header-title",
      content: item.Name,
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    }))
    this.container.add(header)

    // Loading
    const loadingBox = new BoxRenderable(renderer, {
      id: "detail-loading-box",
      flexGrow: 1,
      paddingX: 2,
    })
    loadingBox.add(new TextRenderable(renderer, {
      id: "detail-loading",
      content: strings.detail.loading,
      fg: theme.status.success,
    }))
    this.container.add(loadingBox)


    // Back handler before MediaList loads
    this.keyHandler = (key: KeyEvent) => {
      if (!this.mediaList && (key.name === "escape" || key.name === "backspace")) {
        this.onAction({ type: "back" })
      } else if (key.name === "r") {
        this.refresh()
      }
    }
    renderer.keyInput.on("keypress", this.keyHandler)

    this.loadChildren(loadingBox)
  }

  private async loadChildren(loadingBox: BoxRenderable) {
    let children: JellyfinItem[] = []

    try {
      if (this.item.Type === "Series") {
        children = await this.client.getSeasons(this.item.Id)
        debug("detail", `Loaded ${children.length} seasons`)
      } else if (this.item.Type === "Season") {
        const seriesId = this.item.SeriesId ?? this.item.Id
        children = await this.client.getEpisodes(seriesId, this.item.Id)
        debug("detail", `Loaded ${children.length} episodes`)
      }
    } catch (err) {
      debug("detail", "Failed to load children", { error: String(err) })
    }

    this.container.remove("detail-loading-box")
    loadingBox.destroy()

    if (children.length === 0) {
      const errBox = new BoxRenderable(this.renderer, { id: "detail-empty-box", flexGrow: 1, paddingX: 2 })
      errBox.add(new TextRenderable(this.renderer, {
        id: "detail-empty",
        content: "No items found.",
        fg: theme.text.muted,
      }))
      this.container.add(errBox)
      return
    }

    const contentBox = new BoxRenderable(this.renderer, {
      id: "detail-content",
      flexGrow: 1,
      flexDirection: "column",
      paddingX: 2,
      overflow: "hidden",
    })

    this.mediaList = new MediaList(this.renderer, {
      id: "detail",
      items: children,
      client: this.client,
      formatName: (item) => {
        if (item.Type === "Episode") {
          const ep = item.IndexNumber != null ? `E${String(item.IndexNumber).padStart(2, "0")}` : ""
          return `${ep}  ${item.Name}`
        }
        return item.Name
      },
      formatDesc: (item) => {
        const parts: string[] = []
        if (item.CommunityRating) parts.push(strings.common.rating(item.CommunityRating))
        if (item.RunTimeTicks) parts.push(strings.detail.runtime(Math.round(item.RunTimeTicks / 600000000)))
        if (item.UserData?.Played) parts.push(strings.common.played)
        else if (item.UserData?.PlayedPercentage) parts.push(strings.common.watched(item.UserData.PlayedPercentage))
        return parts.join(" · ")
      },
      onSelect: (item) => {
        if (this.isPlayable(item)) {
          this.onAction({ type: "play", item })
        } else {
          this.onAction({ type: "open-item", item })
        }
      },
      onBack: () => this.onAction({ type: "back" }),
    })

    contentBox.add(this.mediaList.getRenderable())
    this.container.add(contentBox, 1) // insert after header
  }

  private isPlayable(item: JellyfinItem): boolean {
    return item.Type === "Movie" || item.Type === "Episode"
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  /** Refresh: reload detail data */
  async refresh() {
    debug("detail", "Refreshing detail...")
    this.client.clearCache()
    if (this.mediaList) {
      this.mediaList.destroy()
      this.mediaList = null
    }
    try { this.container.remove("detail-content") } catch {}
    
    const loadingBox = new BoxRenderable(this.renderer, {
      id: "detail-loading-box",
      flexGrow: 1,
      paddingX: 2,
    })
    loadingBox.add(new TextRenderable(this.renderer, {
      id: "detail-loading",
      content: strings.detail.loading,
      fg: theme.status.success,
    }))
    this.container.add(loadingBox)
    await this.loadChildren(loadingBox)
  }

  destroy() {
    debug("detail", "DetailScreen destroyed")
    this.renderer.keyInput.off("keypress", this.keyHandler)
    this.mediaList?.destroy()
    this.container.destroy()
  }
}
