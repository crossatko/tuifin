// Shared layout helpers — calculate dimensions accounting for cell pixel size

import { type RenderContext, type CliRenderer } from "@opentui/core"
import { debug } from "./debug"

/** Default cell pixel size (typical monospace font, no line height adjustment) */
const DEFAULT_CELL_PX = { w: 8, h: 16 }

/**
 * Get the actual pixel size of a single terminal cell.
 * Accounts for custom line height, font size, DPI, etc.
 */
export function getCellPixelSize(renderer: RenderContext): { w: number; h: number } {
  try {
    const r = renderer as CliRenderer
    const resolution = r.resolution
    if (resolution && r.width > 0 && r.height > 0) {
      const cellW = Math.round(resolution.width / r.width)
      const cellH = Math.round(resolution.height / r.height)
      debug("layout", `Cell pixel size: ${cellW}x${cellH} (terminal ${resolution.width}x${resolution.height}, grid ${r.width}x${r.height})`)
      return { w: cellW, h: cellH }
    }
  } catch {}
  debug("layout", `Using default cell pixel size: ${DEFAULT_CELL_PX.w}x${DEFAULT_CELL_PX.h}`)
  return DEFAULT_CELL_PX
}

/**
 * Calculate the number of terminal rows needed for a given column width
 * and desired visual aspect ratio (width/height), accounting for cell shape.
 */
export function colsToRows(
  renderer: RenderContext,
  cols: number,
  widthToHeightRatio: number,
): number {
  const cell = getCellPixelSize(renderer)
  const visualHeightPx = (cols * cell.w) / widthToHeightRatio
  const rows = Math.round(visualHeightPx / cell.h)
  return Math.max(1, rows)
}

/** Rows for a standard 2:3 portrait poster. */
export function posterRows(renderer: RenderContext, cols: number): number {
  return colsToRows(renderer, cols, 2 / 3)
}
