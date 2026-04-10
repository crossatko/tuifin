// Status bar — shows while mpv is playing
// Displays item title, progress, and controls hint

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type RenderContext,
} from "@opentui/core"
import { theme } from "../utils/theme"

export class PlaybackStatusBar {
  private renderer: RenderContext
  private container: BoxRenderable
  private titleText: TextRenderable
  private progressText: TextRenderable
  private timeText: TextRenderable
  private isPaused = false

  constructor(renderer: RenderContext, title: string) {
    this.renderer = renderer

    this.container = new BoxRenderable(renderer, {
      id: "playback-statusbar",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingX: 2,
      height: 1,
      backgroundColor: theme.accent,
    })

    this.titleText = new TextRenderable(renderer, {
      id: "playback-title",
      content: `▶  ${title}`,
      fg: theme.bg.base,
      attributes: TextAttributes.BOLD,
    })

    this.progressText = new TextRenderable(renderer, {
      id: "playback-progress",
      content: "",
      fg: theme.bg.base,
    })

    this.timeText = new TextRenderable(renderer, {
      id: "playback-time",
      content: "q: close mpv",
      fg: theme.bg.base,
      attributes: TextAttributes.DIM,
    })

    this.container.add(this.titleText)
    this.container.add(this.progressText)
    this.container.add(this.timeText)
  }

  update(positionSecs: number, durationSecs: number) {
    if (durationSecs > 0) {
      const pct = Math.round((positionSecs / durationSecs) * 100)
      const pos = formatTime(positionSecs)
      const dur = formatTime(durationSecs)
      const bar = buildProgressBar(pct, 20)
      this.progressText.content = `${bar} ${pos} / ${dur}`
    } else {
      this.progressText.content = formatTime(positionSecs)
    }
  }

  updateTitle(title: string) {
    const icon = this.isPaused ? "⏸" : "▶"
    this.titleText.content = `${icon}  ${title}`
  }

  updatePauseState(paused: boolean) {
    if (this.isPaused !== paused) {
      this.isPaused = paused
      const icon = paused ? "⏸" : "▶"
      // Update icon while preserving the title text
      const currentTitle = this.titleText.content.replace(/^[▶⏸]\s+/, "")
      this.titleText.content = `${icon}  ${currentTitle}`
    }
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  destroy() {
    this.container.destroy()
  }
}

function formatTime(secs: number): string {
  const s = Math.floor(secs) % 60
  const m = Math.floor(secs / 60) % 60
  const h = Math.floor(secs / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function buildProgressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}
