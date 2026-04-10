// Home Screen — poster card grid for Continue Watching, Next Up, Libraries

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
import { CardRow, type CardData } from "../components/card-row"

export type HomeAction =
  | { type: "open-item"; item: JellyfinItem }
  | { type: "open-library"; item: JellyfinItem }
  | { type: "play"; item: JellyfinItem }
  | { type: "logout" }

export class HomeScreen {
  private renderer: RenderContext
  private client: JellyfinClient
  private container: BoxRenderable
  private onAction: (action: HomeAction) => void
  private keyHandler: (key: KeyEvent) => void

  private sections: {
    name: string
    cardRow: CardRow
    items: JellyfinItem[]
    actionType: "open-item" | "open-library"
  }[] = []
  private activeSectionIndex = 0

  constructor(
    renderer: RenderContext,
    client: JellyfinClient,
    onAction: (action: HomeAction) => void
  ) {
    this.renderer = renderer
    this.client = client
    this.onAction = onAction

    debug("home", "HomeScreen created")

    this.container = new BoxRenderable(renderer, {
      id: "home-screen",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    // Header
    const header = new BoxRenderable(renderer, {
      id: "home-header",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingX: 2,
      paddingY: 1,
    })
    const titleText = new TextRenderable(renderer, {
      id: "home-title",
      content: strings.app.title,
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    })
    header.add(titleText)
    this.container.add(header)

    // Content area
    const content = new BoxRenderable(renderer, {
      id: "home-content",
      flexDirection: "column",
      flexGrow: 1,
      paddingX: 2,
      gap: 1,
      overflow: "hidden",
    })
    this.container.add(content)

    // Hint bar
    const hint = new TextRenderable(renderer, {
      id: "home-hint",
      content: strings.home.hint,
      attributes: TextAttributes.DIM,
      fg: theme.text.muted,
    })
    this.container.add(hint)

    // Section switching: j/k or up/down to switch sections, h/l handled by CardRow
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "tab" || key.name === "down" || key.name === "j") {
        if (key.shift) {
          this.focusSection(this.activeSectionIndex - 1)
        } else {
          this.focusSection(this.activeSectionIndex + 1)
        }
      } else if (key.name === "up" || key.name === "k") {
        this.focusSection(this.activeSectionIndex - 1)
      } else if (key.name === "q" && key.shift) {
        // Shift+Q for logout
        debug("home", "Logout requested")
        this.onAction({ type: "logout" })
      }
    }
    renderer.keyInput.on("keypress", this.keyHandler)

    // Load data
    this.loadData(content)
  }

  private async loadData(content: BoxRenderable) {
    debug("home", "Loading home data...")
    const loadingText = new TextRenderable(this.renderer, {
      id: "home-loading",
      content: strings.home.loading,
      fg: theme.status.success,
    })
    content.add(loadingText)

    try {
      const [resumeItems, nextUpItems, libraries] = await Promise.all([
        this.client.getResumeItems(10).catch((err) => {
          debug("home", "Failed to fetch resume items", { error: String(err) })
          return []
        }),
        this.client.getNextUp(10).catch((err) => {
          debug("home", "Failed to fetch next up", { error: String(err) })
          return []
        }),
        this.client.getLibraries().catch((err) => {
          debug("home", "Failed to fetch libraries", { error: String(err) })
          throw err // Libraries are critical, propagate error
        }),
      ])

      debug("home", "Data loaded", {
        resumeItems: resumeItems.length,
        nextUpItems: nextUpItems.length,
        libraries: libraries.length,
      })

      content.remove("home-loading")
      loadingText.destroy()

      // Continue Watching
      if (resumeItems.length > 0) {
        this.addCardSection(
          content, "continue",
          strings.home.sections.continueWatching,
          resumeItems, "open-item",
        )
      }

      // Next Up
      if (nextUpItems.length > 0) {
        this.addCardSection(
          content, "nextup",
          strings.home.sections.nextUp,
          nextUpItems, "open-item",
        )
      }

      // Libraries
      if (libraries.length > 0) {
        this.addCardSection(
          content, "libraries",
          strings.home.sections.libraries,
          libraries, "open-library", 1,
        )
      }

      // Focus first section directly — bypass focusSection's same-index guard
      if (this.sections.length > 0) {
        this.sections[0]!.cardRow.focus()
      }
    } catch (err) {
      debug("home", "Failed to load home data", { error: String(err) })
      content.remove("home-loading")
      loadingText.destroy()

      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      const errorText = new TextRenderable(this.renderer, {
        id: "home-error",
        content: strings.home.loadError(errorMsg),
        fg: theme.status.error,
      })
      content.add(errorText)

      // Add retry hint
      const retryHint = new TextRenderable(this.renderer, {
        id: "home-retry-hint",
        content: "Press Shift+Q to logout and try again",
        fg: theme.text.muted,
        attributes: TextAttributes.DIM,
        marginTop: 1,
      })
      content.add(retryHint)
    }
  }

  private addCardSection(
    parent: BoxRenderable,
    id: string,
    title: string,
    items: JellyfinItem[],
    actionType: "open-item" | "open-library",
    textRows?: number,
  ) {
    const section = new BoxRenderable(this.renderer, {
      id: `section-${id}`,
      flexDirection: "column",
      gap: 0,
    })

    // Section title
    const titleText = new TextRenderable(this.renderer, {
      id: `section-${id}-title`,
      content: title,
      fg: theme.text.primary,
      attributes: TextAttributes.BOLD,
      marginBottom: 1,
    })
    section.add(titleText)

    // Build card data
    const cards: CardData[] = items.map((item) => ({
      id: item.Id,
      title: this.formatItemTitle(item),
      subtitle: this.formatItemSubtitle(item),
      subtitle2: this.formatItemSubtitle2(item),
      highlightTitle: item.Type === "Episode",
      imageUrl: item.ImageTags?.Primary
        ? this.client.getImageUrl(item.Id, "Primary", 200)
        : undefined,
    }))

    // Create card row
    const cardRow = new CardRow(this.renderer, {
      id: `section-${id}-cards`,
      cards,
      textRows,
      onSelect: (index) => {
        const item = items[index]
        if (item) {
          debug("home", `Card selected: "${item.Name}"`, { type: item.Type, actionType })
          if (actionType === "open-library") {
            this.onAction({ type: "open-library", item })
          } else if (item.Type === "Episode" || item.Type === "Movie") {
            this.onAction({ type: "play", item })
          } else {
            this.onAction({ type: "open-item", item })
          }
        }
      },
      onFocus: () => {
        // Blur all other rows when this one is focused
        this.sections.forEach((s) => {
          if (s.cardRow !== cardRow) {
            s.cardRow.blur()
          }
        })
      },
    })

    section.add(cardRow.getRenderable())
    parent.add(section)

    this.sections.push({ name: id, cardRow, items, actionType })
  }

  private formatItemTitle(item: JellyfinItem): string {
    if (item.Type === "Episode") {
      const ep = item.IndexNumber ? `E${String(item.IndexNumber).padStart(2, "0")}` : ""
      const season = item.ParentIndexNumber ? `S${String(item.ParentIndexNumber).padStart(2, "0")}` : ""
      return `${season}${ep}`
    }
    return item.Name
  }

  private formatItemSubtitle(item: JellyfinItem): string {
    if (item.Type === "Episode") {
      return item.Name
    }
    const parts: string[] = []
    if (item.CommunityRating) parts.push(strings.common.rating(item.CommunityRating))
    if (item.ProductionYear) parts.push(String(item.ProductionYear))
    if (item.UserData?.PlayedPercentage) {
      parts.push(strings.common.watched(item.UserData.PlayedPercentage))
    }
    return parts.join(" · ")
  }

  private formatItemSubtitle2(item: JellyfinItem): string | undefined {
    if (item.Type === "Episode") {
      return item.SeriesName
    }
    return undefined
  }

  private focusSection(index: number) {
    if (this.sections.length === 0) return
    index = ((index % this.sections.length) + this.sections.length) % this.sections.length
    if (index === this.activeSectionIndex) return

    // Get visual column from current section before blurring
    const currentRow = this.sections[this.activeSectionIndex]?.cardRow
    const visualCol = currentRow?.getVisualColumn() ?? 0

    // Blur current, focus new
    currentRow?.blur()
    this.activeSectionIndex = index
    const newRow = this.sections[this.activeSectionIndex]?.cardRow
    if (newRow) {
      newRow.setVisualColumn(visualCol)
      newRow.focus()
    }

    debug("home", `Focused section ${index}: ${this.sections[index]?.name}, visualCol=${visualCol}`)
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  destroy() {
    this.renderer.keyInput.off("keypress", this.keyHandler)
    for (const section of this.sections) {
      section.cardRow.destroy()
    }
    this.container.destroy()
  }
}
