# tuifin

A terminal UI frontend for [Jellyfin](https://jellyfin.org/) media server. Browse libraries, view media details with poster images, and play video in mpv — all from the terminal.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Browse your Jellyfin library** — movies, TV shows, and more
- **Inline poster images** — Kitty graphics protocol for Ghostty/Kitty/WezTerm, half-block fallback for other terminals
- **Home screen** — Continue Watching, New Episodes, and Library Collections
- **Drill-down navigation** — Series → Seasons → Episodes with detail views
- **Playback via mpv** — launch media directly, resume from last position
- **Progress sync** — watched state and playback progress synced back to Jellyfin
- **Multi-episode playback** — full series playlists with prev/next navigation
- **Encrypted session storage** — credentials saved securely, auto-reconnect on launch
- **Keyboard-driven** — Arrow keys, Vim keys (h/j/k/l), Enter, Esc

## Requirements

- [Bun](https://bun.sh/) (runtime)
- [mpv](https://mpv.io/) (media playback)
- [ImageMagick](https://imagemagick.org/) (`magick` command for image decoding/resizing)
- A Jellyfin server

### Recommended terminals

For the best experience with inline poster images:

- [Ghostty](https://ghostty.org/)
- [Kitty](https://sw.kovidgoez.net/kitty/)
- [WezTerm](https://wezfurlong.org/wezterm/)

Other terminals will use a half-block character fallback for images.

## Installation

```bash
# Clone the repo
git clone https://github.com/crossatko/tuifin.git
cd tuifin

# Install dependencies
bun install

# Build the binary
bun run build

# Optionally install to PATH
cp tuifin ~/.bun/bin/tuifin
```

## Usage

```bash
# Run directly
bun run start

# Or run the compiled binary
./tuifin

# Enable debug logging
./tuifin --debug
# Logs are written to ./logs/debug.log
```

On first launch, you'll be prompted for your Jellyfin server URL, username, and password. Credentials are encrypted and saved for subsequent launches.

## Navigation

| Key | Action |
|---|---|
| `↑` `↓` `←` `→` / `h` `j` `k` `l` | Navigate |
| `Enter` | Select / drill in |
| `Esc` / `Backspace` | Go back |
| `Tab` | Switch focus between form fields |

### During mpv playback

| Key | Action |
|---|---|
| `<` / `>` | Previous / next episode |
| Standard mpv keys | Pause, seek, volume, etc. |

## Development

```bash
# Run in watch mode (auto-restart on file changes)
bun run dev

# Build compiled binary
bun run build
```

## Stack

- **Runtime:** [Bun](https://bun.sh/)
- **Language:** TypeScript
- **TUI framework:** [OpenTUI Core](https://github.com/nicholasgasior/opentui) (imperative API)
- **Media playback:** [mpv](https://mpv.io/)
- **Image protocol:** Kitty graphics protocol + half-block fallback
- **Theme:** Catppuccin Mocha

## License

MIT
