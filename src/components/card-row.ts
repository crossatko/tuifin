// CardRow — horizontal row of poster cards with keyboard navigation
// Each card: poster image on top, title, subtitle, subtitle2
// h/l or left/right to navigate, Enter to select
// Scrolls horizontally when cards overflow the container

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type RenderContext,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import { theme } from "../utils/theme"
import { debug } from "../utils/debug"
import { createImageRenderable, type ImageHandle } from "./image"

export interface CardData {
  id: string
  title: string
  subtitle?: string
  /** Third line, e.g. series name */
  subtitle2?: string
  imageUrl?: string
  /** If true, title line uses accent color instead of primary */
  highlightTitle?: boolean
}

export interface CardRowOptions {
  id: string
  cards: CardData[]
  cardWidth?: number   // terminal columns per card (default 18)
  /** Override poster height in rows. If omitted, uses default. */
  cardHeight?: number
  /** Number of text rows below the image (default 3: title + subtitle + subtitle2) */
  textRows?: number
  onSelect?: (index: number) => void
}

const DEFAULT_CARD_WIDTH = 18
const DEFAULT_IMG_HEIGHT = 4

export class CardRow {
  private renderer: RenderContext
  private container: BoxRenderable
  private cardBoxes: BoxRenderable[] = []
  private selectedIndex = 0
  private scrollOffset = 0
  private cards: CardData[]
  private cardWidth: number
  private imgHeight: number
  private textRows: number
  private onSelect?: (index: number) => void
  private focused = false
  private keyHandler: ((key: KeyEvent) => void) | null = null
  private imageCleanups: (() => void)[] = []
  /** Map from card index → image handle for kitty show/hide */
  private imageHandles: Map<number, { showKitty: () => void; hideKitty: () => void }> = new Map()

  constructor(renderer: RenderContext, options: CardRowOptions) {
    this.renderer = renderer
    this.cards = options.cards
    this.cardWidth = options.cardWidth ?? DEFAULT_CARD_WIDTH
    this.onSelect = options.onSelect

    const imgWidth = this.cardWidth - 2
    this.imgHeight = options.cardHeight ?? DEFAULT_IMG_HEIGHT
    this.textRows = options.textRows ?? 3

    debug("card-row", `CardRow "${options.id}": ${options.cards.length} cards, cardW=${this.cardWidth}, imgH=${this.imgHeight}`)

    this.container = new BoxRenderable(renderer, {      id: options.id,
      flexDirection: "row",
      gap: 1,
      overflow: "hidden",
      onMouseMove: (event) => {
        // Auto-focus row when mouse enters
        if (!this.focused) {
          this.focus()
        }

        // Handle scroll wheel for horizontal scrolling
        if (event.scroll) {
          if (event.scroll.direction === "up") {
            // Scroll left
            if (this.scrollOffset > 0) {
              this.scrollOffset--
              this.updateScroll()
            }
          } else if (event.scroll.direction === "down") {
            // Scroll right
            const visible = this.getVisibleCount()
            const maxOffset = Math.max(0, this.cards.length - visible)
            if (this.scrollOffset < maxOffset) {
              this.scrollOffset++
              this.updateScroll()
            }
          }
        }
      },
    })

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!
      const cardBox = this.createCardBox(i, card)
      this.cardBoxes.push(cardBox)
      this.container.add(cardBox)
    }

    this.loadImages()
    this.updateVisuals()
  }

  private createCardBox(index: number, card: CardData): BoxRenderable {
    const box = new BoxRenderable(this.renderer, {
      id: `${this.container.id}-card-${index}`,
      flexDirection: "column",
      width: this.cardWidth,
      border: true,
      borderStyle: "rounded",
      borderColor: theme.border.muted,
      overflow: "hidden",
      onMouseDown: (event) => {
        // Click triggers selection
        this.selectedIndex = index
        this.updateVisuals()
        this.onSelect?.(index)
      },
      onMouseMove: (event) => {
        // Hover updates selected index (visual feedback)
        if (this.selectedIndex !== index) {
          this.selectedIndex = index
          this.updateVisuals()
        }
      },
    })

    // Placeholder for image
    const imgPlaceholder = new BoxRenderable(this.renderer, {
      id: `${this.container.id}-card-${index}-img`,
      width: this.cardWidth - 2,
      height: this.imgHeight,
      backgroundColor: theme.bg.surface,
    })
    box.add(imgPlaceholder)

    const labelWidth = this.cardWidth - 2
    const titleColor = card.highlightTitle ? theme.accent : theme.text.primary
    const subColor = theme.text.muted

    // Title — 1 row (always shown)
    const titleText = new TextRenderable(this.renderer, {
      id: `${this.container.id}-card-${index}-title`,
      content: card.title,
      fg: titleColor,
      attributes: TextAttributes.BOLD,
      width: labelWidth,
      height: 1,
      truncate: true,
    })
    box.add(titleText)

    // Subtitle — 1 row (if textRows >= 2)
    if (this.textRows >= 2) {
      const subText = new TextRenderable(this.renderer, {
        id: `${this.container.id}-card-${index}-sub`,
        content: card.subtitle ? this.truncateLine(card.subtitle, labelWidth) : "",
        fg: subColor,
        width: labelWidth,
        height: 1,
        truncate: true,
      })
      box.add(subText)
    }

    // Subtitle2 — 1 row (if textRows >= 3)
    if (this.textRows >= 3) {
      const sub2Text = new TextRenderable(this.renderer, {
        id: `${this.container.id}-card-${index}-sub2`,
        content: card.subtitle2 ? this.truncateLine(card.subtitle2, labelWidth) : "",
        fg: subColor,
        width: labelWidth,
        height: 1,
        truncate: true,
      })
      box.add(sub2Text)
    }

    return box
  }

  private truncateLine(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) return text
    return text.slice(0, maxWidth - 1) + "…"
  }

  private async loadImages() {
    const imgWidth = this.cardWidth - 2

    const promises = this.cards.map(async (card, i) => {
      if (!card.imageUrl) return
      const placeholderId = `${this.container.id}-card-${i}-img`
      try {
        const { renderable, cleanup, showKitty, hideKitty } = await createImageRenderable(this.renderer, {
          id: `${this.container.id}-card-${i}-poster`,
          url: card.imageUrl,
          width: imgWidth,
          height: this.imgHeight,
        })
        this.imageCleanups.push(cleanup)
        this.imageHandles.set(i, { showKitty, hideKitty })

        const cardBox = this.cardBoxes[i]
        if (cardBox) {
          try { cardBox.remove(placeholderId) } catch {}
          cardBox.add(renderable, 0)
        }
      } catch (err) {
        debug("card-row", `Failed to load image for card ${i}`, { error: String(err) })
      }
    })

    await Promise.allSettled(promises)
    debug("card-row", "All card images loaded/attempted")

    // Now that images are loaded and in the tree, update Kitty overlays
    this.scheduleKittyUpdate()
  }

  /** Get how many cards fit fully in the visible area */
  private getVisibleCount(): number {
    try {
      const r = this.renderer as CliRenderer
      const termWidth = r.width
      // Account for padding (2 on each side from home-content paddingX)
      const availableWidth = termWidth - 4
      // First card = cardWidth, each additional card = gap + cardWidth
      if (availableWidth < this.cardWidth) return 1
      const count = 1 + Math.floor((availableWidth - this.cardWidth) / (this.cardWidth + 1))
      return Math.max(1, count)
    } catch {
      return 4
    }
  }

  private updateScroll() {
    const visible = this.getVisibleCount()
    const maxOffset = Math.max(0, this.cards.length - visible)

    // Ensure selected card is visible
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex
    } else if (this.selectedIndex >= this.scrollOffset + visible) {
      this.scrollOffset = this.selectedIndex - visible + 1
    }

    // Clamp scroll offset
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset))

    // Apply scroll by shifting cards with marginLeft on the container
    // Each card takes cardWidth + 1 (gap) columns
    const shiftCols = this.scrollOffset * (this.cardWidth + 1)
    this.container.marginLeft = -shiftCols

    debug("card-row", `Scroll: offset=${this.scrollOffset}, visible=${visible}, selected=${this.selectedIndex}, shift=${shiftCols}`)

    // Layout recomputes during the next render pass.
    // We must wait for it before reading absolute positions.
    ;(this.renderer as CliRenderer).requestRender()
    this.scheduleKittyUpdate()
  }

  private kittyUpdateTimer: ReturnType<typeof setTimeout> | null = null

  private scheduleKittyUpdate() {
    // Debounce: only run once after rapid scroll events
    if (this.kittyUpdateTimer) clearTimeout(this.kittyUpdateTimer)
    this.kittyUpdateTimer = setTimeout(() => {
      this.kittyUpdateTimer = null
      this.updateKittyOverlays()
    }, 16) // ~1 frame at 60fps
  }

  private updateKittyOverlays() {
    const visible = this.getVisibleCount()
    let termWidth = 80
    try { termWidth = (this.renderer as CliRenderer).width } catch {}

    for (let i = 0; i < this.cards.length; i++) {
      const handle = this.imageHandles.get(i)
      if (!handle) continue

      // Only show Kitty if card is in the visible scroll window
      const inWindow = i >= this.scrollOffset && i < this.scrollOffset + visible
      if (!inWindow) {
        handle.hideKitty()
        continue
      }

      // Extra safety: check the renderable's x position fits within terminal
      const cardBox = this.cardBoxes[i]
      if (cardBox) {
        const x = cardBox.x
        if (x < 0 || x + this.cardWidth > termWidth) {
          handle.hideKitty()
          continue
        }
      }

      handle.showKitty()
    }
  }

  private updateVisuals() {
    // Update card borders/backgrounds
    for (let i = 0; i < this.cardBoxes.length; i++) {
      const box = this.cardBoxes[i]!
      if (i === this.selectedIndex && this.focused) {
        // Active + focused: accent border, highlighted bg
        box.borderColor = theme.accent
        box.backgroundColor = theme.bg.overlay
      } else {
        // Not selected or not focused: default look
        box.borderColor = theme.border.muted
        box.backgroundColor = undefined as any
      }
    }

    this.updateScroll()
  }

  focus() {
    if (this.focused) return
    this.focused = true
    debug("card-row", `Focus on "${this.container.id}"`)

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "right" || key.name === "l") {
        if (this.selectedIndex < this.cards.length - 1) {
          this.selectedIndex++
          this.updateVisuals()
        }
      } else if (key.name === "left" || key.name === "h") {
        if (this.selectedIndex > 0) {
          this.selectedIndex--
          this.updateVisuals()
        }
      } else if (key.name === "enter" || key.name === "return") {
        debug("card-row", `Card selected: ${this.selectedIndex}`)
        this.onSelect?.(this.selectedIndex)
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)
    this.updateVisuals()
  }

  blur() {
    if (!this.focused) return
    this.focused = false
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
    this.updateVisuals()
  }

  getSelectedIndex(): number {
    return this.selectedIndex
  }

  /** Get the visual column (position relative to the visible window, 0-based) */
  getVisualColumn(): number {
    return this.selectedIndex - this.scrollOffset
  }

  /** Set selection to match a visual column position */
  setVisualColumn(col: number) {
    const targetIndex = this.scrollOffset + col
    this.selectedIndex = Math.max(0, Math.min(targetIndex, this.cards.length - 1))
    this.updateVisuals()
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  destroy() {
    this.blur()
    if (this.kittyUpdateTimer) clearTimeout(this.kittyUpdateTimer)
    for (const cleanup of this.imageCleanups) {
      cleanup()
    }
    this.imageCleanups = []
    this.imageHandles.clear()
    this.container.destroy()
  }
}
