// mpv playback — persistent IPC connection with observe_property for realtime updates

import { debug } from "../utils/debug"
import { JellyfinClient, type JellyfinItem } from "../api/jellyfin"
import type { PlaybackStatusBar } from "../components/statusbar"
import { writeFileSync } from "fs"
import { connect, type Socket } from "node:net"

export interface PlaybackResult {
  /** Progress for each episode that was played: itemId -> positionTicks */
  episodeProgress: Map<string, number>
  /** Episodes that were completed (>90%) */
  completedEpisodes: Set<string>
}

export interface PlaybackSession {
  /** Wait for mpv to exit */
  wait: () => Promise<PlaybackResult>
  /** Kill mpv */
  stop: () => void
}

/**
 * Persistent IPC connection to mpv.
 * Uses observe_property for push-based updates instead of polling.
 */
class MpvIPC {
  private socketPath: string
  private socket: Socket | null = null
  private buffer = ""
  private requestId = 1
  private connected = false
  private destroyed = false
  private onProperty: (name: string, value: any) => void

  // observe_property uses IDs 1000+ to avoid collisions with request IDs
  private observeIds = new Map<number, string>()

  constructor(socketPath: string, onProperty: (name: string, value: any) => void) {
    this.socketPath = socketPath
    this.onProperty = onProperty
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.destroyed) return resolve(false)

      const timeout = setTimeout(() => {
        debug("mpv-ipc", "Connection timeout")
        resolve(false)
      }, 3000)

      this.socket = connect(this.socketPath, () => {
        clearTimeout(timeout)
        this.connected = true
        debug("mpv-ipc", "Connected to mpv IPC")

        // Observe properties for realtime push updates
        this.observeProperty("time-pos", 1001)
        this.observeProperty("duration", 1002)
        this.observeProperty("pause", 1003)
        this.observeProperty("playlist-pos", 1004)

        resolve(true)
      })

      this.socket.on("data", (chunk) => {
        this.buffer += chunk.toString()
        const lines = this.buffer.split("\n")
        this.buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            this.handleMessage(msg)
          } catch {}
        }
      })

      this.socket.on("error", (err) => {
        clearTimeout(timeout)
        debug("mpv-ipc", `Socket error: ${err.message}`)
        this.connected = false
        resolve(false)
      })

      this.socket.on("close", () => {
        this.connected = false
        debug("mpv-ipc", "Socket closed")
      })
    })
  }

  private observeProperty(name: string, id: number) {
    this.observeIds.set(id, name)
    this.send({ command: ["observe_property", id, name] })
  }

  private send(msg: any) {
    if (this.socket && this.connected) {
      this.socket.write(JSON.stringify(msg) + "\n")
    }
  }

  private handleMessage(msg: any) {
    // Property change event from observe_property
    if (msg.event === "property-change") {
      const name = msg.name as string
      const value = msg.data
      if (name && value !== undefined) {
        this.onProperty(name, value)
      }
      return
    }

    // Skip other events
    if (msg.event) return
  }

  destroy() {
    this.destroyed = true
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.connected = false
  }
}

/**
 * Launch mpv with a playlist of episodes.
 * TUI stays visible. Returns a session handle.
 */
export function startMpv(
  client: JellyfinClient,
  episodes: JellyfinItem[],
  startIndex: number,
  statusBar: PlaybackStatusBar,
  onEpisodeComplete?: (episode: JellyfinItem) => void,
): PlaybackSession {
  if (episodes.length === 0) {
    throw new Error("No episodes to play")
  }

  const ipcSocket = `/tmp/tuifin-mpv-${Date.now()}.sock`
  const playlistPath = `/tmp/tuifin-playlist-${Date.now()}.m3u8`

  // Generate m3u8 playlist
  const playlistLines = ["#EXTM3U"]
  for (const ep of episodes) {
    const title = ep.SeriesName
      ? `${ep.SeriesName} - S${String(ep.ParentIndexNumber ?? 0).padStart(2, "0")}E${String(ep.IndexNumber ?? 0).padStart(2, "0")} - ${ep.Name}`
      : ep.Name
    playlistLines.push(`#EXTINF:-1,${title}`)
    playlistLines.push(client.getStreamUrl(ep.Id))
  }
  writeFileSync(playlistPath, playlistLines.join("\n"))

  debug("mpv", `Generated playlist with ${episodes.length} episodes (starting at ${startIndex})`, { playlistPath })

  // Start at resume position of the starting episode
  const startEpisode = episodes[startIndex] ?? episodes[0]!
  const startPosition = startEpisode.UserData?.PlaybackPositionTicks
    ? startEpisode.UserData.PlaybackPositionTicks / 10000000
    : 0

  const args = [
    "mpv",
    playlistPath,
    "--no-terminal",
    "--force-window",
    "--x11-name=tuifin-mpv",
    "--wayland-app-id=tuifin-mpv",
    `--title=${startEpisode.SeriesName ?? startEpisode.Name}`,
    `--input-ipc-server=${ipcSocket}`,
    `--playlist-start=${startIndex}`,
  ]
  if (startPosition > 0) {
    args.push(`--start=${startPosition}`)
  }

  debug("mpv", `Spawning mpv with playlist`, { ipcSocket, startIndex })

  const proc = Bun.spawn(args, {
    stdin: null,
    stdout: "pipe",
    stderr: "pipe",
  })

  // Collect stderr/stdout for debugging
  const collectOutput = async (stream: ReadableStream<Uint8Array> | null, label: string) => {
    if (!stream) return
    try {
      const text = await new Response(stream).text()
      if (text.trim()) debug("mpv", `${label}: ${text.trim()}`)
    } catch {}
  }
  const stdoutPromise = collectOutput(proc.stdout, "stdout")
  const stderrPromise = collectOutput(proc.stderr, "stderr")

  // Track progress for each episode
  const episodeProgress = new Map<string, number>()
  const completedEpisodes = new Set<string>()
  let currentPlaylistIndex = startIndex
  let lastPosition = startPosition
  let lastDuration = 0

  let ipc: MpvIPC | null = null

  // Property change handler — called in realtime by mpv
  const onProperty = (name: string, value: any) => {
    switch (name) {
      case "pause":
        statusBar.updatePauseState(value === true)
        break

      case "time-pos":
        if (typeof value === "number") {
          lastPosition = value
          statusBar.update(value, lastDuration)
        }
        break

      case "duration":
        if (typeof value === "number") {
          lastDuration = value
        }
        break

      case "playlist-pos":
        if (typeof value === "number" && value !== currentPlaylistIndex) {
          debug("mpv", `Playlist position changed: ${currentPlaylistIndex} -> ${value}`)

          // Save progress for previous episode
          const prevEpisode = episodes[currentPlaylistIndex]
          if (prevEpisode) {
            const prevTicks = Math.round(lastPosition * 10000000)
            episodeProgress.set(prevEpisode.Id, prevTicks)

            // Check if previous episode was completed
            if (prevEpisode.RunTimeTicks && prevTicks / prevEpisode.RunTimeTicks > 0.9) {
              completedEpisodes.add(prevEpisode.Id)
              debug("mpv", `Episode ${currentPlaylistIndex} marked complete`)

              client.markPlayed(prevEpisode.Id).catch((err) => {
                debug("mpv", `Failed to mark played: ${err}`)
              })
              onEpisodeComplete?.(prevEpisode)
            }
          }

          currentPlaylistIndex = value
          lastPosition = 0
          lastDuration = 0

          // Update status bar with new episode title
          const newEpisode = episodes[currentPlaylistIndex]
          if (newEpisode) {
            const title = newEpisode.SeriesName
              ? `${newEpisode.SeriesName} — ${newEpisode.Name}`
              : newEpisode.Name
            statusBar.updateTitle(title)
          }
        }
        break
    }
  }

  // Connect IPC with retries (mpv needs time to create the socket)
  const connectIPC = async () => {
    ipc = new MpvIPC(ipcSocket, onProperty)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 300))
      const ok = await ipc.connect()
      if (ok) {
        debug("mpv", `IPC connected on attempt ${attempt + 1}`)
        return
      }
    }
    debug("mpv", "Failed to connect IPC after 10 attempts")
  }

  connectIPC()

  const stop = () => {
    proc.kill()
  }

  const wait = async (): Promise<PlaybackResult> => {
    const exitCode = await proc.exited
    await stdoutPromise
    await stderrPromise
    debug("mpv", `Process exited with code ${exitCode}`)

    // Destroy IPC connection
    if (ipc) {
      ipc.destroy()
      ipc = null
    }

    // Save progress for last episode
    const lastEpisode = episodes[currentPlaylistIndex]
    if (lastEpisode) {
      const lastTicks = Math.round(lastPosition * 10000000)
      episodeProgress.set(lastEpisode.Id, lastTicks)

      // Check if last episode was completed
      if (lastEpisode.RunTimeTicks && lastTicks / lastEpisode.RunTimeTicks > 0.9) {
        completedEpisodes.add(lastEpisode.Id)
        debug("mpv", `Final episode marked complete`)
      } else if (lastTicks > 0) {
        debug("mpv", `Reporting partial progress for last episode: ${lastTicks} ticks`)
        try {
          await client.reportPlaybackStopped(lastEpisode.Id, lastTicks)
        } catch (err) {
          debug("mpv", `Failed to report progress: ${err}`)
        }
      }
    }

    // Cleanup
    try { (await import("node:fs")).unlinkSync(ipcSocket) } catch {}
    try { (await import("node:fs")).unlinkSync(playlistPath) } catch {}

    debug("mpv", `Exited. Watched ${episodeProgress.size} episodes, completed ${completedEpisodes.size}`)

    return { episodeProgress, completedEpisodes }
  }

  return { wait, stop }
}

/**
 * Report playback results to Jellyfin for all watched episodes.
 */
export async function reportPlayback(
  client: JellyfinClient,
  result: PlaybackResult,
): Promise<void> {
  try {
    // Mark completed episodes as played
    for (const itemId of result.completedEpisodes) {
      debug("mpv", `Marking episode ${itemId} as played`)
      await client.markPlayed(itemId)
    }

    // Report progress for partially watched episodes
    for (const [itemId, positionTicks] of result.episodeProgress) {
      if (result.completedEpisodes.has(itemId)) continue
      if (positionTicks > 0) {
        debug("mpv", `Reporting progress for ${itemId}: ${positionTicks} ticks`)
        await client.reportPlaybackStopped(itemId, positionTicks)
      }
    }
  } catch (err) {
    debug("mpv", "Failed to report playback", { error: String(err) })
  }
}
