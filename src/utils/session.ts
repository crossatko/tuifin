// Session storage — encrypted credentials persistence

import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { debug } from "./debug"

export interface SessionData {
  serverUrl: string
  userId: string
  accessToken: string
  username: string
}

const CONFIG_DIR = join(homedir(), ".config", "tuifin")
const SESSION_FILE = join(CONFIG_DIR, "session.enc")

// Simple XOR encryption with a key derived from machine-specific info
// Not military-grade, but keeps credentials from being plaintext on disk
function deriveKey(): Buffer {
  const material = `tuifin-${homedir()}-${process.env.USER ?? "user"}`
  const hash = new Bun.CryptoHasher("sha256")
  hash.update(material)
  return Buffer.from(hash.digest())
}

function xorEncrypt(data: string, key: Buffer): Buffer {
  const input = Buffer.from(data, "utf-8")
  const output = Buffer.alloc(input.length)
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i]! ^ key[i % key.length]!
  }
  return output
}

function xorDecrypt(data: Buffer, key: Buffer): string {
  const output = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    output[i] = data[i]! ^ key[i % key.length]!
  }
  return output.toString("utf-8")
}

export async function saveSession(session: SessionData): Promise<void> {
  debug("session", "Saving session", { serverUrl: session.serverUrl, username: session.username })
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  const key = deriveKey()
  const encrypted = xorEncrypt(JSON.stringify(session), key)
  await Bun.write(SESSION_FILE, encrypted)
}

export async function loadSession(): Promise<SessionData | null> {
  debug("session", "Loading session", { path: SESSION_FILE })
  if (!existsSync(SESSION_FILE)) {
    debug("session", "No session file found")
    return null
  }
  try {
    const key = deriveKey()
    const file = Bun.file(SESSION_FILE)
    const encrypted = Buffer.from(await file.arrayBuffer())
    const json = xorDecrypt(encrypted, key)
    const data = JSON.parse(json)
    if (data.serverUrl && data.userId && data.accessToken && data.username) {
      debug("session", "Session loaded successfully", { serverUrl: data.serverUrl, username: data.username })
      return data as SessionData
    }
    debug("session", "Session file missing fields")
    return null
  } catch (err) {
    debug("session", "Failed to load session", { error: String(err) })
    return null
  }
}

export async function clearSession(): Promise<void> {
  if (existsSync(SESSION_FILE)) {
    const { unlinkSync } = await import("node:fs")
    unlinkSync(SESSION_FILE)
  }
}
