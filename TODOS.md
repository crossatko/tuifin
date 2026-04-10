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
- [x] **Autoplay:** Automatically play next episode when current episode completes

## Next Up
- [ ] Test full flow: home → library → series → season → episode → play → autoplay
- [ ] Poster image grid on home screen sections
- [ ] Quick library sidebar (Phase 5)
- [ ] Polish: loading spinners, error handling, keyboard help overlay
