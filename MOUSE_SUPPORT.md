# Mouse Support Implementation

## ✅ Fully Implemented

### CardRow (Home Screen Cards)
✅ **Auto-focus on hover** - Moving mouse over any row auto-focuses it and blurs others  
✅ **Hover highlight** - Moving mouse over cards updates selection highlight (only in focused row)  
✅ **Click** - Clicking a card triggers the onSelect action  
✅ **Horizontal Scroll** - Mouse wheel up/down scrolls cards left/right  
✅ **Exclusive focus** - Only the focused row shows highlights; other rows are blurred

### SelectRenderable / MediaList (Library/Detail Screens)
✅ **Auto-focus on hover** - Moving mouse over list auto-focuses it  
✅ **Click to select** - Clicking list items selects and opens them  
✅ **Vertical Scroll** - Mouse wheel up/down scrolls list  
✅ **Preview updates** - Hovering items updates preview sidebar

### Login Screen Inputs
✅ **Click to focus** - Clicking anywhere in a field row focuses that input  
✅ **Quick navigation** - Click labels or inputs directly

## How It Works

### Throttling Scroll Events
Some terminals (like Ghostty) fire 3+ scroll events per physical wheel tick. We throttle these:

```typescript
const now = Date.now()
if (now - this.lastScrollTime < 50) return  // Ignore rapid duplicates
this.lastScrollTime = now
```

**Why throttle, not debounce?**
- **Debounce**: Waits for events to stop, then fires → delays all scrolling
- **Throttle**: Processes first event, ignores rapid duplicates → immediate response

Result: Smooth 1:1 scrolling (one physical tick = one scroll action)

### Auto-Focus Pattern
All interactive components auto-focus when the mouse enters their area:
- CardRow: `onMouseMove` on container calls `this.focus()` + `onFocus()` callback
- MediaList: `onMouseMove` on listPanel calls `this.select?.focus()`
- Login: `onMouseDown` on field rows calls `this.focusCurrentInput()`

This eliminates the need to keyboard-navigate to components before using the mouse.

### Event Handling
- **Hover** (`onMouseMove`): Updates `selectedIndex` for visual feedback, auto-focuses components
  - CardRow: Individual cards have onMouseMove handlers that update selection
  - MediaList: Hovering list area auto-focuses SelectRenderable
- **Click** (`onMouseDown`): Triggers selection actions
- **Scroll** (`onMouseScroll`): Only scrolls content, **never updates selection**
  - CardRow: Horizontal scrolling (left/right through cards)
  - MediaList: Vertical scrolling (up/down through list items)
  - Throttled to 50ms to filter duplicate events from terminals
  - Selection updates only when mouse moves, not when scrolling

### Key Discovery
Scroll events require a **separate `onMouseScroll` handler** - they don't come through `onMouseMove` with `event.scroll`. This was discovered by checking the tuidaw project which uses `onMouseScroll` successfully.

## Implementation Notes

### Separation of Scroll and Selection
**Scroll and selection are completely decoupled:**

**Scrolling (onMouseScroll):**
- Only changes `scrollOffset` to shift content
- Never touches `selectedIndex`
- Throttled to prevent duplicate events

```typescript
onMouseScroll: (event) => {
  // Throttle
  if (Date.now() - lastScrollTime < 50) return
  
  // Just scroll, don't update selection
  if (event.scroll.direction === "up") {
    this.scrollOffset--
    this.updateScroll()
  }
}
```

**Selection (onMouseMove on card boxes):**
- Updates `selectedIndex` when cursor enters a card
- Works whether scrolled or not

```typescript
// Each card box has its own onMouseMove
onMouseMove: (event) => {
  if (this.selectedIndex !== index) {
    this.selectedIndex = index
    this.updateVisuals()
  }
}
```

**Result:**
- Scroll wheel → content scrolls, highlight stays on same card
- Move mouse → highlight updates to card under cursor
- Clean separation prevents highlight drift during scrolling

### MediaList Click Detection
Clicking list items calculates the clicked index from Y position:
```typescript
const itemHeight = 3 // Approximate rows per item (name + desc + spacing)
const relativeY = event.y - listPanel.y
const clickedIndex = Math.floor(relativeY / itemHeight)
```

### Scroll Wheel Direction
- `event.scroll.direction === "up"` = scroll content down (show earlier items)
- `event.scroll.direction === "down"` = scroll content up (show later items)

For CardRow horizontal scrolling:
- Wheel up → scroll left (decrement offset)
- Wheel down → scroll right (increment offset)

### Focus Management
CardRow uses an `onFocus` callback system to ensure exclusive focus:
1. When a row receives focus, it calls its `onFocus` callback
2. HomeScreen passes a callback that blurs all other CardRows
3. Result: Only one row is highlighted at a time
