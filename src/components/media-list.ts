// MediaList — reusable two-panel component: item list + preview sidebar
// Used by both LibraryScreen and DetailScreen
// Features: fuzzy search (/), debounced preview, poster sidebar

import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
  TextAttributes,
  RGBA,
  type RenderContext,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import { JellyfinClient, type JellyfinItem } from "../api/jellyfin"
import { theme } from "../utils/theme"
import { strings } from "../utils/strings"
import { debug } from "../utils/debug"
import { createImageRenderable } from "./image"

export interface MediaListOptions {
  id: string
  items: JellyfinItem[]
  client: JellyfinClient
  formatName: (item: JellyfinItem) => string
  formatDesc: (item: JellyfinItem) => string
  onSelect: (item: JellyfinItem) => void
  /** Called when Esc/Backspace pressed */
  onBack: () => void
}

const PREVIEW_WIDTH = 32
const POSTER_HEIGHT = 19  // For portrait posters (series, seasons, movies)
const EPISODE_THUMBNAIL_HEIGHT = 7  // For 16:9 episode thumbnails
const MIN_WIDTH_FOR_PREVIEW = 80

export class MediaList {
  private renderer: RenderContext
  private container: BoxRenderable
  private select: SelectRenderable | null = null
  private previewBox: BoxRenderable | null = null
  private previewImageCleanup: (() => void) | null = null
  private previewImageHide: (() => void) | null = null
  private previewImageShow: (() => void) | null = null
  private previewGeneration = 0
  private previewDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private searchBar: BoxRenderable | null = null
  private searchInput: InputRenderable | null = null
  private _searching = false
  private items: JellyfinItem[]
  private client: JellyfinClient
  private formatName: (item: JellyfinItem) => string
  private formatDesc: (item: JellyfinItem) => string
  private onSelect: (item: JellyfinItem) => void
  private onBack: () => void
  private keyHandler: (key: KeyEvent) => void
  private resizeHandler: (width: number, height: number) => void
  private showPreview: boolean
  private row: BoxRenderable
  /** Throttle scroll events - some terminals fire multiple events per tick */
  private lastScrollTime = 0
  /** Track last key + time for gg detection */
  private lastKeyName = ""
  private lastKeyTime = 0

  constructor(renderer: RenderContext, options: MediaListOptions) {
    this.renderer = renderer
    this.items = options.items
    this.client = options.client
    this.formatName = options.formatName
    this.formatDesc = options.formatDesc
    this.onSelect = options.onSelect
    this.onBack = options.onBack

    let termWidth = 80
    try { termWidth = (renderer as CliRenderer).width } catch {}
    this.showPreview = termWidth >= MIN_WIDTH_FOR_PREVIEW

    // Outer wrapper: column so search bar can sit below the list
    this.container = new BoxRenderable(renderer, {
      id: `${options.id}-medialist`,
      flexDirection: "column",
      flexGrow: 1,
      overflow: "hidden",
    })

    // Inner row: list + preview side by side
    this.row = new BoxRenderable(renderer, {
      id: `${options.id}-medialist-row`,
      flexDirection: "row",
      flexGrow: 1,
      gap: 2,
      overflow: "hidden",
    })
    this.container.add(this.row)

    this.buildList(options.id, this.row)
    if (this.showPreview) this.buildPreview(this.row)

    // Keyboard handler
    this.keyHandler = (key: KeyEvent) => {
      if (this._searching) return
      if (key.name === "escape" || key.name === "backspace") {
        this.onBack()
      } else if (key.name === "/") {
        this.openSearch()
      } else if (key.name === "g" && key.shift) {
        // Shift+G → go to bottom
        if (this.select && this.items.length > 0) {
          this.select.setSelectedIndex(this.items.length - 1)
        }
      } else if (key.name === "g" && !key.shift) {
        // gg → go to top (double-tap g within 500ms)
        const now = Date.now()
        if (this.lastKeyName === "g" && now - this.lastKeyTime < 500) {
          if (this.select) {
            this.select.setSelectedIndex(0)
          }
          this.lastKeyName = ""
          this.lastKeyTime = 0
        } else {
          this.lastKeyName = "g"
          this.lastKeyTime = now
        }
      } else {
        this.lastKeyName = ""
        this.lastKeyTime = 0
      }
    }
    renderer.keyInput.on("keypress", this.keyHandler)

    // Resize handler — toggle preview panel on live resize
    this.resizeHandler = (width: number, _height: number) => {
      const shouldShow = width >= MIN_WIDTH_FOR_PREVIEW
      if (shouldShow && !this.showPreview) {
        this.showPreview = true
        this.buildPreview(this.row)
        const index = this.select?.getSelectedIndex() ?? 0
        const item = this.items[index]
        if (item) this.schedulePreviewUpdate(item)
      } else if (!shouldShow && this.showPreview) {
        this.showPreview = false
        this.removePreview()
      }
    }
    ;(renderer as CliRenderer).on("resize", this.resizeHandler)

    // Focus list and show first preview
    this.select?.focus()
    if (this.items[0] && this.showPreview) {
      this.schedulePreviewUpdate(this.items[0])
    }
  }

  private buildList(id: string, row: BoxRenderable) {
    const listPanel = new BoxRenderable(this.renderer, {
      id: `${id}-list-panel`,
      flexDirection: "column",
      flexGrow: 1,
      overflow: "hidden",
    })

    const options = this.items.map((item) => ({
      name: this.formatName(item),
      description: this.formatDesc(item),
      value: item.Id,
    }))

    this.select = new SelectRenderable(this.renderer, {
      id: `${id}-select`,
      options,
      flexGrow: 1,
      backgroundColor: RGBA.fromValues(0, 0, 0, 0),
      textColor: theme.text.primary,
      selectedBackgroundColor: theme.select.selectedBg,
      selectedTextColor: theme.accent,
      focusedBackgroundColor: RGBA.fromValues(0, 0, 0, 0),
      focusedTextColor: theme.text.primary,
      itemSpacing: 1,
    })

    this.select.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      const item = this.items[index]
      if (item) this.onSelect(item)
    })

    this.select.on(SelectRenderableEvents.SELECTION_CHANGED, (index) => {
      const item = this.items[index]
      if (item && this.showPreview) this.schedulePreviewUpdate(item)
    })

    // Mouse handlers directly on SelectRenderable
    this.select.onMouseMove = (event) => {
      try {
        // Auto-focus
        if (!this.select!.focused) {
          this.select!.focus()
        }
        // Highlight item under cursor WITHOUT scrolling the viewport
        const idx = this.getItemIndexAtY(event.y)
        if (idx !== null && idx !== this.select!.getSelectedIndex()) {
          // Save scroll position, set index, restore scroll position
          const scrollOff = (this.select as any).scrollOffset
          this.select!.setSelectedIndex(idx)
          ;(this.select as any).scrollOffset = scrollOff
        }
      } catch (err) {
        debug("media-list", `onMouseMove ERROR: ${err}`)
      }
    }

    this.select.onMouseScroll = (event) => {
      if (!event.scroll || !this.select) return

      // Throttle
      const now = Date.now()
      if (now - this.lastScrollTime < 50) return
      this.lastScrollTime = now

      // Manually scroll the viewport without changing selection
      const sel = this.select as any
      const maxScroll = Math.max(0, this.items.length - (sel.maxVisibleItems ?? 1))
      
      let didScroll = false
      if (event.scroll.direction === "up" && sel.scrollOffset > 0) {
        sel.scrollOffset--
        didScroll = true
      } else if (event.scroll.direction === "down" && sel.scrollOffset < maxScroll) {
        sel.scrollOffset++
        didScroll = true
      }

      if (!didScroll) return // Nothing to scroll, don't touch selection

      sel.requestRender()

      // Update highlight to item under cursor without scrolling viewport
      const idx = this.getItemIndexAtY(event.y)
      if (idx !== null) {
        const scrollOff = sel.scrollOffset
        this.select.setSelectedIndex(idx)
        sel.scrollOffset = scrollOff
      }
    }

    this.select.onMouseDown = (event) => {
      // Left-click = open item under cursor
      if (event.button !== 0) return
      const idx = this.getItemIndexAtY(event.y)
      if (idx !== null) {
        const scrollOff = (this.select as any).scrollOffset
        this.select!.setSelectedIndex(idx)
        ;(this.select as any).scrollOffset = scrollOff
        const item = this.items[idx]
        if (item) this.onSelect(item)
      }
    }

    listPanel.add(this.select)
    row.add(listPanel)
  }

  private buildPreview(row: BoxRenderable) {
    // Vertical line separator
    const separator = new BoxRenderable(this.renderer, {
      id: "medialist-preview-sep",
      width: 1,
      height: "100%",
      backgroundColor: theme.border.muted,
    })
    row.add(separator)

    this.previewBox = new BoxRenderable(this.renderer, {
      id: "medialist-preview",
      flexDirection: "column",
      width: PREVIEW_WIDTH,
      paddingX: 1,
      gap: 1,
      overflow: "hidden",
    })
    row.add(this.previewBox)
  }

  private removePreview() {
    if (this.previewImageCleanup) {
      this.previewImageCleanup()
      this.previewImageCleanup = null
      this.previewImageHide = null
      this.previewImageShow = null
    }
    try { this.row.remove("medialist-preview-sep") } catch {}
    if (this.previewBox) {
      this.row.remove("medialist-preview")
      this.previewBox.destroy()
      this.previewBox = null
    }
  }

  // --- Search ---

  private openSearch() {
    if (!this.select || this._searching) return
    this._searching = true

    this.searchBar = new BoxRenderable(this.renderer, {
      id: "medialist-search-bar",
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
    })

    this.searchBar.add(new TextRenderable(this.renderer, {
      id: "medialist-search-label",
      content: "/",
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    }))

    this.searchInput = new InputRenderable(this.renderer, {
      id: "medialist-search-input",
      width: 30,
      value: "",
      placeholder: "fuzzy search...",
      backgroundColor: RGBA.fromValues(0, 0, 0, 0),
      textColor: theme.text.primary,
      cursorColor: theme.accent,
      focusedBackgroundColor: RGBA.fromValues(0, 0, 0, 0),
    })

    this.searchInput.on(InputRenderableEvents.INPUT, (value: string) => {
      this.fuzzyScrollTo(value)
    })

    this.searchInput.on(InputRenderableEvents.ENTER, () => {
      const index = this.select?.getSelectedIndex() ?? -1
      const item = this.items[index]
      this.closeSearch()
      if (item) this.onSelect(item)
    })

    const escHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.closeSearch()
        this.renderer.keyInput.off("keypress", escHandler)
      } else if (key.name === "up" || key.name === "down") {
        this.closeSearch()
        this.renderer.keyInput.off("keypress", escHandler)
      }
    }
    this.renderer.keyInput.on("keypress", escHandler)

    this.searchBar.add(this.searchInput)
    this.container.add(this.searchBar)

    this.select.blur()
    queueMicrotask(() => this.searchInput?.focus())
  }

  private closeSearch() {
    if (!this._searching) return
    this._searching = false
    if (this.searchBar) {
      this.container.remove("medialist-search-bar")
      this.searchBar.destroy()
      this.searchBar = null
      this.searchInput = null
    }
    this.select?.focus()
    // Update preview for the selected item after search closes
    if (this.select && this.showPreview) {
      const index = this.select.getSelectedIndex()
      const item = this.items[index]
      if (item) this.schedulePreviewUpdate(item)
    }
  }

  private fuzzyScrollTo(query: string) {
    if (!this.select || !query.trim()) return
    const q = query.toLowerCase()
    let bestIndex = -1
    let bestScore = -1

    for (let i = 0; i < this.items.length; i++) {
      const name = this.formatName(this.items[i]!).toLowerCase()
      const score = this.fuzzyScore(q, name)
      if (score > bestScore) { bestScore = score; bestIndex = i }
    }

    if (bestIndex >= 0 && bestScore > 0) {
      this.select.setSelectedIndex(bestIndex)
      // Don't update preview during search — too many rapid image loads
      // cause Kitty graphics race conditions. Preview updates on search close.
    }
  }

  private fuzzyScore(query: string, target: string): number {
    let qi = 0, score = 0, consecutive = 0, prevMatch = -1
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) {
        score += 1
        if (prevMatch === ti - 1) { consecutive++; score += consecutive * 2 }
        else consecutive = 0
        if (ti === 0) score += 5
        prevMatch = ti
        qi++
      }
    }
    return qi === query.length ? score : 0
  }

  // --- Preview ---

  private schedulePreviewUpdate(item: JellyfinItem) {
    if (this.destroyed) return
    if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer)
    // Use longer debounce during search to prevent Kitty image race conditions
    const delay = this._searching ? 500 : 150
    this.previewDebounceTimer = setTimeout(() => {
      this.previewDebounceTimer = null
      this.updatePreview(item)
    }, delay)
  }

  private async updatePreview(item: JellyfinItem) {
    if (this.destroyed || !this.previewBox) return
    const generation = ++this.previewGeneration

    if (this.previewImageCleanup) {
      this.previewImageCleanup()
      this.previewImageCleanup = null
      this.previewImageHide = null
      this.previewImageShow = null
    }

    for (const id of ["mp-poster", "mp-title", "mp-meta", "mp-status", "mp-overview"]) {
      try { this.previewBox.remove(id) } catch {}
    }

    const contentWidth = PREVIEW_WIDTH - 2  // minus paddingX
    const posterWidth = contentWidth + 2  // slightly wider to fully cover half-block

    // Use 16:9 aspect for episode thumbnails, portrait for others
    const imageHeight = item.Type === "Episode" ? EPISODE_THUMBNAIL_HEIGHT : POSTER_HEIGHT

    // Poster — use series poster for episodes if no own image
    const imageItemId = item.ImageTags?.Primary ? item.Id
      : (item.SeriesId ?? null)

    if (imageItemId) {
      const imageUrl = this.client.getImageUrl(imageItemId, "Primary", posterWidth * 8)
      try {
        const { renderable, cleanup, showKitty, hideKitty } = await createImageRenderable(this.renderer, {
          id: "mp-poster",
          url: imageUrl,
          width: posterWidth,
          height: imageHeight,
        })
        if (generation !== this.previewGeneration) { cleanup(); return }
        this.previewImageCleanup = cleanup
        this.previewImageHide = hideKitty
        this.previewImageShow = showKitty
        if (this.previewBox) { this.previewBox.add(renderable, 0); showKitty() }
      } catch {}
    }

    // Title
    this.previewBox.add(new TextRenderable(this.renderer, {
      id: "mp-title",
      content: item.Name,
      fg: theme.text.primary,
      attributes: TextAttributes.BOLD,
      width: contentWidth,
      wrapMode: "word",
      height: 2,
      truncate: true,
    }))

    // Meta
    const metaParts: string[] = []
    if (item.ProductionYear) metaParts.push(strings.detail.year(item.ProductionYear))
    if (item.CommunityRating) metaParts.push(strings.common.rating(item.CommunityRating))
    if (item.RunTimeTicks) metaParts.push(strings.detail.runtime(Math.round(item.RunTimeTicks / 600000000)))
    if (item.OfficialRating) metaParts.push(item.OfficialRating)
    if (metaParts.length > 0) {
      this.previewBox.add(new TextRenderable(this.renderer, {
        id: "mp-meta",
        content: metaParts.join(" · "),
        fg: theme.text.muted,
        width: contentWidth,
        truncate: true,
      }))
    }

    // Watch status
    const statusContent = item.UserData?.Played ? strings.common.played
      : item.UserData?.PlayedPercentage ? strings.common.watched(item.UserData.PlayedPercentage)
      : null
    const statusColor = item.UserData?.Played ? theme.status.success : theme.status.warning
    if (statusContent) {
      this.previewBox.add(new TextRenderable(this.renderer, {
        id: "mp-status",
        content: statusContent,
        fg: statusColor,
        width: contentWidth,
      }))
    }

    // Overview
    if (item.Overview) {
      this.previewBox.add(new TextRenderable(this.renderer, {
        id: "mp-overview",
        content: item.Overview,
        fg: theme.text.muted,
        width: contentWidth,
        wrapMode: "word",
        height: 4,
        truncate: true,
      }))
    }
  }

  /** Map a screen Y coordinate to a list item index, accounting for SelectRenderable's scroll offset */
  private getItemIndexAtY(screenY: number): number | null {
    if (!this.select) return null
    const relativeY = screenY - this.select.y
    if (relativeY < 0) return null
    
    // SelectRenderable uses linesPerItem=2 (name + description) + itemSpacing=1
    const linesPerItem = 3
    const visibleSlot = Math.floor(relativeY / linesPerItem)
    const scrollOff = (this.select as any).scrollOffset ?? 0
    const itemIndex = scrollOff + visibleSlot
    
    if (itemIndex >= 0 && itemIndex < this.items.length) {
      return itemIndex
    }
    return null
  }

  get isSearching(): boolean {
    return this._searching
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  destroy() {
    this.destroyed = true
    if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer)
    // Increment generation to poison any in-flight updatePreview — when the async
    // createImageRenderable resolves it will see the mismatch and call cleanup()
    // itself instead of storing the image on a dead object.
    this.previewGeneration++
    if (this.previewImageCleanup) {
      this.previewImageCleanup()
      this.previewImageCleanup = null
      this.previewImageHide = null
      this.previewImageShow = null
    }
    // Blur the select to stop its internal key handler from firing events
    this.select?.blur()
    this.renderer.keyInput.off("keypress", this.keyHandler)
    ;(this.renderer as CliRenderer).off("resize", this.resizeHandler)
    this.container.destroy()
  }
}
