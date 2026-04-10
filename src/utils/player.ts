// mpv playback — runs mpv in a separate window, polls IPC for progress

import { debug } from "../utils/debug"
import { JellyfinClient, type JellyfinItem } from "../api/jellyfin"
import type { PlaybackStatusBar } from "../components/statusbar"

export interface PlaybackResult {
  positionTicks: number
  completed: boolean
}

export interface PlaybackSession {
  /** Wait for mpv to exit */
  wait: () => Promise<PlaybackResult>
  /** Kill mpv */
  stop: () => void
}

/**
 * Launch mpv in a separate window (--no-terminal).
 * TUI stays visible. Returns a session handle.
 */
export function startMpv(
  client: JellyfinClient,
  item: JellyfinItem,
  statusBar: PlaybackStatusBar,
): PlaybackSession {
  const streamUrl = client.getStreamUrl(item.Id)
  const title = item.SeriesName
    ? `${item.SeriesName} — ${item.Name}`
    : item.Name

  const ipcSocket = `/tmp/jellytui-mpv-${Date.now()}.sock`
  const startPosition = item.UserData?.PlaybackPositionTicks
    ? item.UserData.PlaybackPositionTicks / 10000000
    : 0

  const args = [
    "mpv",
    streamUrl,
    "--no-terminal",
    "--x11-name=jellytui-mpv",
    "--wayland-app-id=jellytui-mpv",
    `--title=${title}`,
    `--input-ipc-server=${ipcSocket}`,
  ]
  if (startPosition > 0) {
    args.push(`--start=${startPosition}`)
  }

  debug("mpv", `Spawning mpv: ${title}`, { ipcSocket })

  const proc = Bun.spawn(args, {
    stdin: null,
    stdout: null,
    stderr: null,
  })

  // Poll IPC for progress once socket is ready
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastPosition = startPosition

  const startPolling = () => {
    pollTimer = setInterval(async () => {
      try {
        const pos = await ipcGet(ipcSocket, "time-pos")
        const dur = await ipcGet(ipcSocket, "duration")
        if (pos != null) {
          lastPosition = pos
          statusBar.update(pos, dur ?? 0)
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
    await proc.exited

    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }

    // Try one last position read
    try {
      const pos = await ipcGet(ipcSocket, "time-pos")
      if (pos != null) lastPosition = pos
    } catch {}

    // Cleanup socket
    try { (await import("node:fs")).unlinkSync(ipcSocket) } catch {}

    const positionTicks = Math.round(lastPosition * 10000000)
    const completed = item.RunTimeTicks
      ? positionTicks / item.RunTimeTicks > 0.9
      : false

    debug("mpv", `Exited. position=${lastPosition}s, completed=${completed}`)

    return { positionTicks, completed }
  }

  return { wait, stop }
}

/**
 * Query a property from mpv's IPC socket.
 */
async function ipcGet(socketPath: string, property: string): Promise<number | null> {
  const { connect } = await import("node:net")
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve(null)
    }, 500)

    const socket = connect(socketPath, () => {
      socket.write(JSON.stringify({ command: ["get_property", property] }) + "\n")
    })

    let data = ""
    socket.on("data", (chunk) => {
      data += chunk.toString()
      try {
        const resp = JSON.parse(data)
        clearTimeout(timeout)
        socket.destroy()
        resolve(typeof resp.data === "number" ? resp.data : null)
      } catch {}
    })

    socket.on("error", () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

/**
 * Report final playback state to Jellyfin.
 */
export async function reportPlayback(
  client: JellyfinClient,
  item: JellyfinItem,
  result: PlaybackResult,
): Promise<void> {
  try {
    if (result.completed) {
      debug("mpv", `Marking "${item.Name}" as played`)
      await client.markPlayed(item.Id)
    } else if (result.positionTicks > 0) {
      debug("mpv", `Reporting progress: ${result.positionTicks} ticks`)
      await client.reportPlaybackStopped(item.Id, result.positionTicks)
    }
  } catch (err) {
    debug("mpv", "Failed to report playback", { error: String(err) })
  }
}
