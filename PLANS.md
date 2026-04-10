# JellyTUI — Roadmap

## Phase 1: Foundation
- [x] Project setup (Bun + TypeScript + OpenTUI boilerplate)
- [x] Jellyfin API client (auth, fetch libraries, fetch items, images)
- [x] Login screen (server URL, username, password inputs)
- [x] Encrypted session storage (save/load credentials, auto-reconnect)

## Phase 2: Home Screen
- [x] Home screen layout with vertical sections
- [x] "Continue Watching" section (horizontal row of items)
- [x] "New Episodes" section (horizontal row of items)
- [x] "Library Collection" section (list of libraries)
- [x] Poster image grid (with text fallback for unsupported terminals)

## Phase 3: Browsing & Details
- [x] Library browser — list of items with poster preview sidebar
- [x] Unified detail view for Series/Season/Episode/Movie (poster, title, desc, rating)
- [x] Series → seasons list, Season → episodes list (drill-down)
- [x] Episode/Movie detail with play action
- [x] Navigation: j/k navigate, Enter to drill in, Esc/Backspace to go back
- [x] Navigation stack with back history

## Phase 4: Playback
- [x] Launch mpv with media URL (takes over terminal, TUI resumes after)
- [x] Resume from last position
- [x] Send playback progress to Jellyfin on mpv exit
- [x] Mark items as watched on completion (>90%)
- [x] Full series playlist with prev/next navigation (< and > keys in mpv)
- [x] Multi-episode progress tracking and sync to Jellyfin

## Phase 5: Quick Library Sidebar
- [ ] Evokable sidebar overlay (keybinding: Tab or similar)
- [ ] List of all libraries for quick jump
- [ ] Dismiss with Esc or same keybinding

## Phase 6: Polish
- [ ] Loading states / spinners for API calls
- [ ] Error handling (connection failures, auth errors, timeouts)
- [ ] Keyboard shortcut help overlay
- [ ] Smooth scrolling / focus management

## Future (not MVP)
- [ ] Favorite / like toggle on series and movies
- [ ] Music library support
- [ ] Search functionality
- [ ] User switching / multi-server support
- [ ] Subtitle / audio track selection before playback
