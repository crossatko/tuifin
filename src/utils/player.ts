// mpv playback — runs mpv with playlist support, polls IPC for progress

import { debug } from "../utils/debug"
import { JellyfinClient, type JellyfinItem } from "../api/jellyfin"
import type { PlaybackStatusBar } from "../components/statusbar"
import { writeFileSync } from "fs"

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

  const ipcSocket = `/tmp/jellytui-mpv-${Date.now()}.sock`
  const playlistPath = `/tmp/jellytui-playlist-${Date.now()}.m3u8`

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
    "--x11-name=jellytui-mpv",
    "--wayland-app-id=jellytui-mpv",
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

  // Poll IPC for progress and playlist position
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const startPolling = () => {
    pollTimer = setInterval(async () => {
      try {
        const props = await ipcGetProperties(ipcSocket, [
          "playlist-pos", "time-pos", "duration", "pause"
        ])
        
        const playlistPos = props.has("playlist-pos") ? Number(props.get("playlist-pos")) : null
        const timePos = props.has("time-pos") ? Number(props.get("time-pos")) : null
        const duration = props.has("duration") ? Number(props.get("duration")) : null
        const paused = props.has("pause") ? Boolean(props.get("pause")) : null

        // Update pause state in status bar
        if (paused != null) {
          statusBar.updatePauseState(paused)
        }

        // Detect playlist position change (user pressed < or >)
        if (playlistPos != null && playlistPos !== currentPlaylistIndex) {
          debug("mpv", `Playlist position changed: ${currentPlaylistIndex} -> ${playlistPos}`)
          
          // Save progress for previous episode
          const prevEpisode = episodes[currentPlaylistIndex]
          if (prevEpisode) {
            const prevTicks = Math.round(lastPosition * 10000000)
            episodeProgress.set(prevEpisode.Id, prevTicks)
            
            // Check if previous episode was completed
            if (prevEpisode.RunTimeTicks && prevTicks / prevEpisode.RunTimeTicks > 0.9) {
              completedEpisodes.add(prevEpisode.Id)
              debug("mpv", `Episode ${currentPlaylistIndex} marked complete`)
              
              // Report to server immediately and notify callback
              client.markPlayed(prevEpisode.Id).catch((err) => {
                debug("mpv", `Failed to mark played: ${err}`)
              })
              onEpisodeComplete?.(prevEpisode)
            }
          }

          currentPlaylistIndex = playlistPos
          lastPosition = 0 // Reset position for new episode

          // Update status bar with new episode title
          const newEpisode = episodes[currentPlaylistIndex]
          if (newEpisode) {
            const title = newEpisode.SeriesName
              ? `${newEpisode.SeriesName} — ${newEpisode.Name}`
              : newEpisode.Name
            statusBar.updateTitle(title)
          }
        }

        // Update current episode progress
        if (timePos != null) {
          lastPosition = timePos
          statusBar.update(timePos, duration ?? 0)
        }
      } catch {
        // Socket not ready yet or mpv closed
      }
    }, 1000)
  }

  // Give mpv a moment to start before polling
  setTimeout(startPolling, 1500)

  const stop = () => {
    proc.kill()
  }

  const wait = async (): Promise<PlaybackResult> => {
    const exitCode = await proc.exited
    await stdoutPromise
    await stderrPromise
    debug("mpv", `Process exited with code ${exitCode}`)

    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }

    // Try one last read for current episode
    try {
      const props = await ipcGetProperties(ipcSocket, ["time-pos"])
      const pos = props.has("time-pos") ? Number(props.get("time-pos")) : null
      if (pos != null) lastPosition = pos
    } catch {}

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
        // Report partial progress to server immediately
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
 * Query multiple properties from mpv's IPC socket in a single connection.
 */
async function ipcGetProperties(socketPath: string, properties: string[]): Promise<Map<string, any>> {
  const { connect } = await import("node:net")
  return new Promise((resolve) => {
    const results = new Map<string, any>()
    let pending = properties.length
    let requestId = 1
    const idToProperty = new Map<number, string>()

    const timeout = setTimeout(() => {
      socket.destroy()
      resolve(results)
    }, 800)

    const socket = connect(socketPath, () => {
      for (const prop of properties) {
        const id = requestId++
        idToProperty.set(id, prop)
        socket.write(JSON.stringify({ command: ["get_property", prop], request_id: id }) + "\n")
      }
    })

    let buffer = ""
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      // mpv sends one JSON object per line
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? "" // Keep incomplete line in buffer
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const resp = JSON.parse(line)
          // Skip events (they don't have request_id)
          if (resp.event) continue
          const prop = idToProperty.get(resp.request_id)
          if (prop && resp.error === "success") {
            results.set(prop, resp.data)
          }
          pending--
          if (pending <= 0) {
            clearTimeout(timeout)
            socket.destroy()
            resolve(results)
          }
        } catch {}
      }
    })

    socket.on("error", () => {
      clearTimeout(timeout)
      resolve(results)
    })
  })
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
      // Skip if already marked complete
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
