// JellyTUI — Main entry point

import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { JellyfinClient, type JellyfinItem } from "./api/jellyfin"
import { loadSession, saveSession, clearSession } from "./utils/session"
import { LoginScreen, type LoginScreenResult } from "./screens/login"
import { HomeScreen } from "./screens/home"
import { LibraryScreen } from "./screens/library"
import { DetailScreen } from "./screens/detail"
import { startMpv, reportPlayback } from "./utils/player"
import { PlaybackStatusBar } from "./components/statusbar"
import { initDebug, debug } from "./utils/debug"
import { cleanupAllImages } from "./components/image"

// Init debug before anything else
initDebug(process.argv)

debug("main", "Starting JellyTUI", { args: process.argv.slice(2) })

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 30,
})

debug("main", "Renderer created", { width: renderer.width, height: renderer.height })

type Screen = LoginScreen | HomeScreen | LibraryScreen | DetailScreen

let currentScreen: Screen | null = null
let jellyfinClient: JellyfinClient | null = null

// Navigation stack for back navigation
const navStack: Array<() => void> = []

function setScreen(screen: Screen) {
  debug("main", `Setting screen: ${screen.constructor.name}`)
  if (currentScreen) {
    currentScreen.destroy()
  }
  cleanupAllImages()
  currentScreen = screen
  renderer.root.add(screen.getRenderable())
}

function showLogin(prefillServerUrl?: string) {
  debug("main", "Showing login screen", { prefillServerUrl })
  navStack.length = 0

  const login = new LoginScreen(renderer, async (result: LoginScreenResult) => {
    debug("main", "Login callback received", { username: result.auth.username })

    await saveSession({
      serverUrl: result.client.serverUrl,
      userId: result.auth.userId,
      accessToken: result.auth.accessToken,
      username: result.auth.username,
    })
    debug("main", "Session saved")

    jellyfinClient = result.client
    showHome()
  }, { serverUrl: prefillServerUrl })

  setScreen(login)
}

function showHome() {
  if (!jellyfinClient) return
  debug("main", "Showing home screen")
  navStack.length = 0

  const client = jellyfinClient
  const home = new HomeScreen(renderer, client, (action) => {
    debug("main", "Home action", { type: action.type, name: action.item.Name })
    switch (action.type) {
      case "open-item":
        showDetail(client, action.item)
        break
      case "open-library":
        showLibrary(client, action.item)
        break
      case "play":
        handlePlay(client, action.item)
        break
    }
  })

  setScreen(home)
}

function showLibrary(client: JellyfinClient, library: JellyfinItem) {
  debug("main", "Showing library", { name: library.Name })

  // Push "go back to home" onto nav stack
  navStack.push(() => showHome())

  const screen = new LibraryScreen(renderer, client, library, (action) => {
    debug("main", "Library action", { type: action.type })
    switch (action.type) {
      case "open-item":
        // Push library restoration so back-from-detail returns here
        navStack.push(() => showLibrary(client, library))
        showDetail(client, action.item)
        break
      case "back":
        goBack()
        break
    }
  })

  setScreen(screen)
}

function showDetail(client: JellyfinClient, item: JellyfinItem) {
  debug("main", "Showing detail", { name: item.Name, type: item.Type })

  // Don't push to navStack here — the caller (showLibrary / showHome action handler)
  // already has the right "go back" entry on the stack.
  // When navigating deeper (series → season), we push a factory to re-open THIS
  // item so the user can go back to it from the child screen.
  const screen = new DetailScreen(renderer, client, item, (action) => {
    debug("main", "Detail action", { type: action.type })
    switch (action.type) {
      case "open-item":
        // Push factory so back-from-child returns here
        navStack.push(() => showDetail(client, item))
        showDetail(client, action.item)
        break
      case "play":
        handlePlay(client, action.item)
        break
      case "back":
        goBack()
        break
    }
  })

  setScreen(screen)
}

function goBack() {
  const restore = navStack.pop()
  if (restore) {
    debug("main", "Going back", { stackDepth: navStack.length })
    restore()
  } else {
    debug("main", "Nav stack empty, going home")
    showHome()
  }
}

async function handlePlay(client: JellyfinClient, item: JellyfinItem) {
  debug("main", "Starting playback", { name: item.Name, type: item.Type })

  // Fetch playlist: for episodes, get full series; for movies, just the single item
  let episodes: JellyfinItem[]
  let startIndex = 0

  if (item.Type === "Episode") {
    debug("main", "Fetching series playlist...")
    const playlist = await client.getSeriesPlaylist(item)
    episodes = playlist.episodes
    startIndex = playlist.startIndex
    debug("main", `Playlist ready: ${episodes.length} episodes, starting at ${startIndex}`)
  } else {
    // For movies, single-item playlist
    episodes = [item]
    startIndex = 0
  }

  // Add status bar to current screen's renderable
  const title = item.SeriesName
    ? `${item.SeriesName} — ${item.Name}`
    : item.Name
  const statusBar = new PlaybackStatusBar(renderer, title)
  const statusBarRenderable = statusBar.getRenderable()
  renderer.root.add(statusBarRenderable)

  const session = startMpv(client, episodes, startIndex, statusBar)
  activeSession = session

  try {
    const result = await session.wait()
    debug("main", "Playback finished", {
      watchedCount: result.episodeProgress.size,
      completedCount: result.completedEpisodes.size,
    })
    await reportPlayback(client, result)
  } catch (err) {
    debug("main", "Playback error", { error: String(err) })
  } finally {
    activeSession = null
    renderer.root.remove(statusBarRenderable.id)
    statusBar.destroy()
  }
}

let activeSession: ReturnType<typeof startMpv> | null = null

// Global quit handler
renderer.keyInput.on("keypress", (key) => {
  if (key.name !== "q") return
  if (activeSession) {
    debug("main", "Stopping mpv via 'q'")
    activeSession.stop()
  } else if (!(currentScreen instanceof LoginScreen)) {
    debug("main", "Quit requested via 'q' key")
    renderer.destroy()
  }
})

// Log all keypresses in debug mode
renderer.keyInput.on("keypress", (key) => {
  debug("keypress", `name=${key.name} ctrl=${key.ctrl} shift=${key.shift} meta=${key.meta} type=${key.eventType}`)
})

// Start: try to restore session
async function main() {
  debug("main", "Checking for saved session")
  const session = await loadSession()

  if (session) {
    debug("main", "Found saved session", { serverUrl: session.serverUrl, username: session.username })
    jellyfinClient = new JellyfinClient({
      serverUrl: session.serverUrl,
      userId: session.userId,
      accessToken: session.accessToken,
    })

    try {
      await jellyfinClient.getLibraries()
      debug("main", "Session valid, skipping login")
      showHome()
    } catch (err) {
      debug("main", "Session expired, clearing", { error: String(err) })
      jellyfinClient = null
      await clearSession()
      showLogin(session.serverUrl)
    }
  } else {
    debug("main", "No saved session, showing login")
    showLogin()
  }
}

main()
