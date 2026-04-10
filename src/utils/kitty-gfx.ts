// Kitty Graphics Protocol — real inline images in supporting terminals
// Protocol spec: https://sw.kovidgoyal.net/kitty/graphics-protocol/
//
// How it works:
// 1. Upload image data (base64 PNG) to the terminal, assign an ID
// 2. Place image at cell coordinates with specified size
// 3. Terminal renders actual pixels overlaid on the cell grid
// 4. Delete placement when no longer needed

import { debug } from "../utils/debug"

let nextImageId = 1

function writeToTerminal(data: string) {
  process.stdout.write(data)
}

/** Escape sequence wrapper for Kitty graphics */
function kittyGraphicsCmd(params: string, payload: string = ""): string {
  return `\x1b_G${params};${payload}\x1b\\`
}

/**
 * Upload image data to the terminal.
 * Returns an image ID for later placement.
 */
export function uploadImage(pngData: Uint8Array): number {
  const id = nextImageId++
  const b64 = Buffer.from(pngData).toString("base64")

  debug("kitty", `Uploading image id=${id}, size=${pngData.byteLength}`)

  // Send in chunks (max 4096 bytes per chunk as per protocol)
  const CHUNK_SIZE = 4096
  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE))
  }

  if (chunks.length === 1) {
    // Single chunk: m=0 (no more data)
    writeToTerminal(kittyGraphicsCmd(`a=t,f=100,i=${id},m=0`, chunks[0]!))
  } else {
    // Multi-chunk: first with m=1, middle with m=1, last with m=0
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1
      const isFirst = i === 0
      if (isFirst) {
        writeToTerminal(kittyGraphicsCmd(`a=t,f=100,i=${id},m=1`, chunks[i]!))
      } else {
        writeToTerminal(kittyGraphicsCmd(`m=${isLast ? 0 : 1}`, chunks[i]!))
      }
    }
  }

  return id
}

/**
 * Place an uploaded image at a specific cell position.
 * The terminal overlays the image on the cell grid.
 */
export function placeImage(
  imageId: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
  placementId?: number,
): void {
  debug("kitty", `Placing image id=${imageId} at (${col},${row}) size=${cols}x${rows}`)

  // Move cursor to target position, then place
  const cursorMove = `\x1b[${row + 1};${col + 1}H`
  const pId = placementId ?? imageId
  const cmd = kittyGraphicsCmd(`a=p,i=${imageId},p=${pId},c=${cols},r=${rows},C=1,q=2`)

  writeToTerminal(cursorMove + cmd)
}

/**
 * Delete a specific image placement.
 */
export function deleteImage(imageId: number): void {
  debug("kitty", `Deleting image id=${imageId}`)
  writeToTerminal(kittyGraphicsCmd(`a=d,d=i,i=${imageId},q=2`))
}

/**
 * Delete all image placements.
 */
export function deleteAllImages(): void {
  debug("kitty", "Deleting all images")
  writeToTerminal(kittyGraphicsCmd(`a=d,d=a,q=2`))
}

/**
 * Check if terminal likely supports Kitty graphics.
 * Ghostty, Kitty, and WezTerm support it.
 */
export function isKittyGraphicsSupported(): boolean {
  const term = process.env.TERM ?? ""
  const termProgram = process.env.TERM_PROGRAM ?? ""
  return (
    term.includes("kitty") ||
    term.includes("xterm-ghostty") ||
    termProgram.toLowerCase().includes("ghostty") ||
    termProgram.toLowerCase().includes("kitty") ||
    termProgram.toLowerCase().includes("wezterm")
  )
}
