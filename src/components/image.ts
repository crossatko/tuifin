// Image component — dual-mode rendering
//
// Always creates a half-block FrameBuffer as the base renderable (clips with overflow).
// For Kitty-capable terminals, also uploads a Kitty image overlay that can be
// shown/hidden. Fully visible cards get crisp Kitty images, edge cards fall back
// to the half-block version which clips properly.

import {
  FrameBufferRenderable,
  BoxRenderable,
  RGBA,
  type RenderContext,
  type Renderable,
} from "@opentui/core"
import { ptr } from "bun:ffi"
import { debug } from "../utils/debug"
import { theme } from "../utils/theme"
import { getCellPixelSize } from "../utils/layout"
import {
  uploadImage,
  placeImage,
  deleteImage,
  isKittyGraphicsSupported,
} from "../utils/kitty-gfx"

export interface ImageOptions {
  id: string
  url: string
  width: number    // terminal columns
  height: number   // terminal rows
  /** Fine-tune Kitty placement offset (cols, rows) */
  placementOffset?: { x: number; y: number }
}

export interface ImageHandle {
  renderable: Renderable
  cleanup: () => void
  /** Show Kitty overlay at current position (for fully visible cards) */
  showKitty: () => void
  /** Hide Kitty overlay, revealing half-block underneath (for edge/off-screen cards) */
  hideKitty: () => void
}

const activeKittyImages: Map<string, number> = new Map()
const LETTERBOX_BG = theme.bg.surface

export async function createImageRenderable(
  renderer: RenderContext,
  options: ImageOptions,
): Promise<ImageHandle> {
  const { id, url, width, height } = options
  const kittySupported = isKittyGraphicsSupported()

  debug("image", `Creating "${id}" kitty=${kittySupported} ${width}x${height}cells`)

  // Always create half-block as the base renderable
  const fb = new FrameBufferRenderable(renderer, {
    id,
    width,
    height,
  })

  let kittyId: number | null = null
  let kittyVisible = false

  // Fetch image once
  let imageBytes: Uint8Array | null = null
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    imageBytes = new Uint8Array(await res.arrayBuffer())
  } catch (err) {
    debug("image", `Fetch failed: ${err}`, { id })
    renderFBPlaceholder(fb, width, height)
    return {
      renderable: fb,
      cleanup: () => {},
      showKitty: () => {},
      hideKitty: () => {},
    }
  }

  // Render half-block version (always)
  try {
    const pixelW = width * 2
    const pixelH = height * 2
    const rgba = await convertImage(imageBytes, pixelW, pixelH, "rgba", true)
    const bytesPerRow = pixelW * 4
    const dataPtr = ptr(rgba)
    fb.frameBuffer.drawSuperSampleBuffer(0, 0, dataPtr, rgba.byteLength, "rgba8unorm", bytesPerRow)
    debug("image", `Half-block rendered: ${id}`)
  } catch (err) {
    debug("image", `Half-block failed: ${err}`, { id })
    renderFBPlaceholder(fb, width, height)
  }

  // Upload Kitty version (if supported)
  if (kittySupported) {
    try {
      const cell = getCellPixelSize(renderer)
      const pixelW = width * cell.w
      const pixelH = height * cell.h
      const pngData = await convertImage(imageBytes, pixelW, pixelH, "png", false)
      kittyId = uploadImage(pngData)
      activeKittyImages.set(id, kittyId)
      debug("image", `Kitty uploaded: id=${kittyId}`)
    } catch (err) {
      debug("image", `Kitty upload failed: ${err}`, { id })
    }
  }

  const offsetX = options.placementOffset?.x ?? 0
  const offsetY = options.placementOffset?.y ?? 0

  const showKitty = () => {
    if (kittyId == null) return
    const pos = getAbsolutePosition(fb)
    if (pos) {
      placeImage(kittyId, pos.x + offsetX, pos.y + offsetY, width, height)
      kittyVisible = true
    }
  }

  const hideKitty = () => {
    if (kittyId == null || !kittyVisible) return
    deleteImage(kittyId)
    kittyVisible = false
  }

  // Don't auto-place — caller manages show/hide via the returned handle

  return {
    renderable: fb,
    cleanup: () => {
      if (kittyId != null) {
        deleteImage(kittyId)
        activeKittyImages.delete(id)
      }
    },
    showKitty,
    hideKitty,
  }
}

// --- Image conversion ---

async function convertImage(
  imageBytes: Uint8Array,
  targetW: number,
  targetH: number,
  format: "png" | "rgba",
  fill: boolean = false,
): Promise<Uint8Array> {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const tmpIn = `/tmp/jt-${ts}-${rand}-in`
  const ext = format === "png" ? "png" : "rgba"
  const tmpOut = `/tmp/jt-${ts}-${rand}-out.${ext}`
  const outArg = format === "rgba" ? `rgba:${tmpOut}` : tmpOut

  await Bun.write(tmpIn, imageBytes)

  try {
    const resizeArgs = fill
      ? ["-resize", `${targetW}x${targetH}^`,  // fill: scale to cover, may exceed
         "-gravity", "center",
         "-extent", `${targetW}x${targetH}`]      // then crop to exact size
      : ["-resize", `${targetW}x${targetH}`,     // fit: scale to fit within
         "-gravity", "center",
         "-background", LETTERBOX_BG,
         "-extent", `${targetW}x${targetH}`]      // pad to exact size

    const proc = Bun.spawn([
      "magick", tmpIn,
      ...resizeArgs,
      "-depth", "8",
      outArg,
    ], { stderr: "pipe" })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`magick exit ${exitCode}: ${stderr.slice(0, 200)}`)
    }

    const outFile = Bun.file(tmpOut)
    const outBuf = new Uint8Array(await outFile.arrayBuffer())

    if (format === "rgba") {
      const expectedSize = targetW * targetH * 4
      if (outBuf.length < expectedSize) {
        throw new Error(`RGBA size mismatch: got ${outBuf.length}, expected ${expectedSize}`)
      }
    }

    return outBuf
  } finally {
    try { (await import("node:fs")).unlinkSync(tmpIn) } catch {}
    try { (await import("node:fs")).unlinkSync(tmpOut) } catch {}
  }
}

// --- Helpers ---

function getAbsolutePosition(renderable: Renderable): { x: number; y: number } | null {
  try {
    return { x: renderable.x, y: renderable.y }
  } catch {
    return null
  }
}

function renderFBPlaceholder(fb: FrameBufferRenderable, width: number, height: number) {
  const bg = RGBA.fromHex(theme.bg.surface)
  const fg = RGBA.fromHex(theme.text.muted)
  fb.frameBuffer.fillRect(0, 0, width, height, bg)
  const label = "No Image"
  const x = Math.max(0, Math.floor((width - label.length) / 2))
  const y = Math.max(0, Math.floor(height / 2))
  fb.frameBuffer.drawText(label, x, y, fg, bg)
}

export function cleanupAllImages(): void {
  for (const [id, kittyId] of activeKittyImages) {
    deleteImage(kittyId)
  }
  activeKittyImages.clear()
}
