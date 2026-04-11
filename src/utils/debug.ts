// Debug logger — writes to ./logs/debug.log when --debug flag is passed

import { mkdirSync, appendFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const LOG_DIR = join(process.cwd(), "logs")
const LOG_FILE = join(LOG_DIR, "debug.log")

let enabled = false

export function initDebug(args: string[]) {
  enabled = args.includes("--debug")
  if (enabled) {
    mkdirSync(LOG_DIR, { recursive: true })
    writeFileSync(LOG_FILE, `--- tuifin debug log started at ${new Date().toISOString()} ---\n`)
    debug("logger", "Debug logging enabled")
  }
}

export function isDebugEnabled(): boolean {
  return enabled
}

export function debug(tag: string, msg: string, data?: unknown) {
  if (!enabled) return
  const ts = new Date().toISOString()
  let line = `[${ts}] [${tag}] ${msg}`
  if (data !== undefined) {
    try {
      line += ` ${JSON.stringify(data)}`
    } catch {
      line += ` [unserializable]`
    }
  }
  appendFileSync(LOG_FILE, line + "\n")
}
