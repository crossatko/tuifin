// Status bar — persistent at bottom of screen
// Idle: dark background, muted text
// Active: accent background, playback info

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type RenderContext,
} from "@opentui/core"
import { theme } from "../utils/theme"
import { strings } from "../utils/strings"

export class PlaybackStatusBar {
  private renderer: RenderContext
  private container: BoxRenderable
  private titleText: TextRenderable
  private progressText: TextRenderable
  private hintText: TextRenderable
  private isPaused = false
  private active = false

  constructor(renderer: RenderContext) {
    this.renderer = renderer

    this.container = new BoxRenderable(renderer, {
      id: "playback-statusbar",
      position: "absolute",
      bottom: 0,
      left: 0,
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingX: 2,
      height: 1,
      backgroundColor: theme.bg.surface,
    })

    this.titleText = new TextRenderable(renderer, {
      id: "playback-title",
      content: strings.statusBar.notPlaying,
      fg: theme.text.muted,
      attributes: TextAttributes.DIM,
    })

    this.progressText = new TextRenderable(renderer, {
      id: "playback-progress",
      content: "",
      fg: theme.text.muted,
    })

    this.hintText = new TextRenderable(renderer, {
      id: "playback-hint",
      content: strings.statusBar.idleHint,
      fg: theme.text.muted,
      attributes: TextAttributes.DIM,
    })

    this.container.add(this.titleText)
    this.container.add(this.progressText)
    this.container.add(this.hintText)
  }

  /** Switch to active playback mode */
  activate(title: string) {
    this.active = true
    this.isPaused = false
    this.container.backgroundColor = theme.accent
    this.titleText.content = `▶  ${title}`
    this.titleText.fg = theme.bg.base
    this.titleText.attributes = TextAttributes.BOLD
    this.progressText.content = ""
    this.progressText.fg = theme.bg.base
    this.hintText.content = strings.statusBar.activeHint
    this.hintText.fg = theme.bg.base
  }

  /** Switch back to idle mode */
  deactivate() {
    this.active = false
    this.isPaused = false
    this.container.backgroundColor = theme.bg.surface
    this.titleText.content = strings.statusBar.notPlaying
    this.titleText.fg = theme.text.muted
    this.titleText.attributes = TextAttributes.DIM
    this.progressText.content = ""
    this.progressText.fg = theme.text.muted
    this.hintText.content = strings.statusBar.idleHint
    this.hintText.fg = theme.text.muted
  }

  update(positionSecs: number, durationSecs: number) {
    if (!this.active) return
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
    if (!this.active) return
    const icon = this.isPaused ? "⏸" : "▶"
    this.titleText.content = `${icon}  ${title}`
  }

  updatePauseState(paused: boolean) {
    if (!this.active) return
    if (this.isPaused !== paused) {
      this.isPaused = paused
      const icon = paused ? "⏸" : "▶"
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
