// Strings — all user-facing text, centralised for translation
// To translate: duplicate this file, change values, import the right one

export const strings = {
  app: {
    name: "JellyTUI",
    title: "🍿 JellyTUI",
  },

  login: {
    subtitle: "Connect to your Jellyfin server",
    serverUrl: "Server URL",
    username: "Username",
    password: "Password",
    placeholder: {
      serverUrl: "http://localhost:8096",
      username: "username",
      password: "password",
    },
    hint: "Tab: next field  |  Enter: login  |  Ctrl+C: quit",
    connecting: "⏳ Connecting...",
    welcome: (name: string) => `✓ Welcome, ${name}!`,
    error: {
      serverRequired: "⚠ Server URL is required",
      usernameRequired: "⚠ Username is required",
      invalidCredentials: "✗ Invalid username or password",
      serverNotFound: "✗ Server not found. Check the URL and try again.",
      networkError: "✗ Network error. Check your connection.",
      connectionFailed: (msg: string) => `✗ ${msg}`,
    },
  },

  home: {
    hint: "  h/l: browse cards  |  j/k: switch section  |  Enter: select  |  Shift+Q: logout  |  q: quit",
    loading: "⏳ Loading...",
    loadError: (msg: string) => `✗ Failed to load: ${msg}`,
    sections: {
      continueWatching: "▶ Continue Watching",
      nextUp: "🆕 Next Up",
      libraries: "📚 Libraries",
    },
  },

  library: {
    hint: "  j/k: navigate  |  Enter: open  |  /: search  |  Esc: back  |  q: quit",
    loading: "⏳ Loading library...",
    empty: "No items in this library.",
    loadError: (msg: string) => `✗ Failed to load library: ${msg}`,
  },

  detail: {
    hint: "  j/k: navigate  |  Enter: select  |  p: play  |  Esc: back  |  q: quit",
    loading: "⏳ Loading...",
    loadError: (msg: string) => `✗ Failed to load: ${msg}`,
    play: "▶ Play",
    resume: (pct: number) => `▶ Resume (${Math.round(pct)}%)`,
    seasons: "Seasons",
    episodes: "Episodes",
    noOverview: "No description available.",
    year: (y: number) => `${y}`,
    runtime: (mins: number) => `${mins} min`,
    seasonLabel: (n: number) => `Season ${n}`,
    episodeLabel: (s: number, e: number) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`,
  },

  common: {
    watched: (pct: number) => `${Math.round(pct)}% watched`,
    rating: (r: number) => `★ ${r.toFixed(1)}`,
    played: "✓ Watched",
  },
  statusBar: {
    notPlaying: "Nothing playing",
    idleHint: "q: quit  Shift+Q: logout  r: refresh",
    activeHint: "q: stop playback",
  },
} as const

export type Strings = typeof strings
