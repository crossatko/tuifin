# JellyTUI — Agent Instructions

## What is JellyTUI?

A terminal UI frontend for [Jellyfin](https://jellyfin.org/) media server. Browse libraries, view media details with poster images, and play video in mpv — all from the terminal.

## Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **TUI framework:** OpenTUI Core — imperative API, no React/Solid (see `.pi/skills/opentui/SKILL.md`)
- **Media playback:** mpv (takes over terminal, TUI resumes after exit)
- **Image protocol:** Kitty graphics protocol for real inline images (Ghostty/Kitty/WezTerm), half-block fallback for other terminals
- **Target terminal:** Ghostty (used for development/testing)

## Architecture & User Flow

### 1. Login Screen

- First launch: prompt for **server URL**, **username**, **password**
- Authenticate via Jellyfin API, save session to an encrypted file
- On subsequent launches, load saved session (re-auth if expired)

### 2. Home Screen (after login)

Full-screen pages, no permanent sidebar. Sections stacked vertically:

- **Continue Watching** — in-progress media (resume points from server)
- **New Episodes** — recently added episodes for shows in user's library
- **Library Collection** — all libraries (Movies, TV Shows, etc.) as entry points

Each section shows a horizontal scrollable row of items as **poster image grids** (falls back to text list if terminal doesn't support images).

### 3. Library Browser

- Entering a library (e.g. "TV Shows") shows a **grid of posters** (or text list fallback)
- Scrollable, navigable with arrow keys

### 4. Detail Views

Drill-down hierarchy for TV: **Series → Season → Episode**

**Series detail:**

- Poster image, title, description, rating
- List of seasons

**Season detail:**

- Poster/banner, title, description
- List of episodes

**Episode detail:**

- Thumbnail, title, description, rating
- Action: Play in mpv

**Movie detail:**

- Poster, title, description, rating
- Action: Play in mpv

### 5. Playback

- mpv spawns new window
- tui shows active statusbar with "Playing: [Title]" and progress
- Watched state / progress synced back to Jellyfin server

### Navigation Keys

- **Arrow keys** and **Vim keys** (h/j/k/l) for all navigation
- Enter to select/drill in, Esc/Backspace to go back
- Tab for focus switching (e.g. between form fields)

### 6. Quick Library Sidebar (evokable)

- Triggered by a keybinding (e.g. `l` or `Tab`)
- Overlay/panel listing all libraries for quick navigation
- Dismiss with same key or `Esc`

## Jellyfin API

Use Jellyfin's REST API. Key endpoints:

- `POST /Users/AuthenticateByName` — login
- `GET /Users/{userId}/Items` — list library items
- `GET /Users/{userId}/Items/Resume` — continue watching
- `GET /Shows/NextUp` — new/next episodes
- `GET /Users/{userId}/Items/{itemId}` — item details
- `GET /Items/{itemId}/Images/Primary` — poster images
- `POST /Users/{userId}/PlayedItems/{itemId}` — mark watched
- `POST /Users/{userId}/FavoriteItems/{itemId}` — toggle favorite

## Agent Workflow

### Planning files (IMPORTANT — maintain these)

- **`PLANS.md`** — Long-term roadmap. Persistent across sessions. After completing a feature, mark it as done with `[x]`.
- **`TODOS.md`** — Short-term task list for the current work session. Overwrite freely with new tasks as needed. update this file before starting anything from a new prompt. update it with any followups for keeping context between sessions. you can overwrite it if everything is done./

### Before coding

1. Checkout to feature brach with apropriate name
2. Read the OpenTUI skill: `.pi/skills/opentui/SKILL.md`
3. Check `PLANS.md` to understand current project state
4. Check `TODOS.md` for immediate tasks
5. Update `TODOS.md` with your plan before starting

### Code conventions

- **No hardcoded colors** — use `src/utils/theme.ts` (Catppuccin Mocha palette)
- **No hardcoded user-facing strings** — use `src/utils/strings.ts` (enables translation)
- All new screens/components must import `theme` and `strings` instead of inline values
- When adding new colors → add to `theme`, when adding new text → add to `strings`
- **Debug logging** — use `debug(tag, msg, data?)` from `src/utils/debug.ts` in all crucial functions
  - Run with `--debug` flag to enable: `bun run src/index.ts --debug`
  - Logs go to `./logs/debug.log` with timestamps
  - Add debug calls to: screen lifecycle, API calls, keyboard handlers, state changes
- **Enter key is `"return"`** — Ghostty/Kitty send `key.name === "return"` not `"enter"`. Always check both: `key.name === "enter" || key.name === "return"`
- **InputRenderable consumes Enter** — listen for `InputRenderableEvents.ENTER` on inputs, not global keypress
- **Image rendering** — two paths:
  - **Kitty graphics** (Ghostty/Kitty/WezTerm): real inline images via escape sequences (`src/utils/kitty-gfx.ts`)
  - **Half-block fallback** (other terminals): `drawSuperSampleBuffer` via FrameBuffer (▀ chars, 2px/row)
  - Both paths use ImageMagick (`magick`) for decoding/resizing — must be installed
  - `createImageRenderable()` returns `{ renderable, cleanup }` — always call cleanup on destroy
  - `cleanupAllImages()` on screen transitions to remove stale kitty placements

### After completing a feature

1. Mark it done in `PLANS.md` with `[x]`
2. Update `TODOS.md` with next steps
3. Commit code with clear message referencing the feature/task
4. always cleanup todos from completed tasks if the task was not the subject to recent followups, if there are followups, update the todos with them and mark the completed task as done, but don't remove it until all followups are done. if there are no followups, remove the completed task from todos.
5. if feature is complete, squash commits into one with a clear message referencing the feature/task and merge to dev branch and checkout to it

### After every code change

**Always compile and install the binary** so the user can test immediately:

```bash
cd /home/kreejzak/code/crossatko/jellytui && bun build src/index.ts --compile --outfile jellytui && rm -f ~/.bun/bin/jellytui && cp jellytui ~/.bun/bin/jellytui
```

This ensures `jellytui` command always runs the latest version.
