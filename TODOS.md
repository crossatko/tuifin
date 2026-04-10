# TODOS — Current Session

## Completed
- [x] Project scaffolding with OpenTUI Core
- [x] Jellyfin API client with all key endpoints
- [x] Encrypted session storage
- [x] Login screen with Tab navigation, Enter submit
- [x] Home screen with Continue Watching, Next Up, Libraries
- [x] Debug logging system (--debug flag)
- [x] Theme + strings extraction
- [x] Library browser with poster preview sidebar
- [x] Unified detail screen (Series/Season/Episode/Movie)
- [x] Navigation stack (Esc/Backspace goes back)
- [x] mpv playback (suspend TUI, resume, report progress)
- [x] Image component (half-block rendering via FrameBuffer + ImageMagick)
- [x] **Bug fixes:**
  - [x] Kitty image memory leak (MediaList preview images persisting after destroy)
  - [x] Ghost keypresses (SelectRenderable staying focused after MediaList destroy)
  - [x] Navigation stack fixes (Library → Series → Season back navigation)
  - [x] Status bar not disappearing after mpv exit
  - [x] Episode thumbnail aspect ratio (16:9)
  - [x] Dynamic play/pause icon in status bar
- [x] **Playlist playback:** Full series playlist with mpv prev/next navigation (< and > keys)
- [x] **Progress tracking:** Multi-episode watch progress and completion sync
- [x] **Logout:** Shift+Q to logout and return to login screen
- [x] **Error handling:** Better login errors, network failures, partial data loading

## Next Up
- [ ] Test full flow: home → library → series → season → episode → play → mpv </> navigation
- [ ] Polish: loading spinners, keyboard help overlay
- [ ] Quick library sidebar (Phase 5)
