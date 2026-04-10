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

### Auto-Focus Pattern
All interactive components auto-focus when the mouse enters their area:
- CardRow: `onMouseMove` on container calls `this.focus()` + `onFocus()` callback
- MediaList: `onMouseMove` on listPanel calls `this.select?.focus()`
- Login: `onMouseDown` on field rows calls `this.focusCurrentInput()`

This eliminates the need to keyboard-navigate to components before using the mouse.

### Event Handling
- **Hover** (`onMouseMove`): Updates `selectedIndex` for visual feedback, auto-focuses components
- **Click** (`onMouseDown`): Triggers selection actions
- **Scroll** (`onMouseScroll`): Separate handler for wheel events
  - CardRow: Horizontal scrolling (left/right through cards)
  - MediaList: Vertical scrolling (up/down through list items)

### Key Discovery
Scroll events require a **separate `onMouseScroll` handler** - they don't come through `onMouseMove` with `event.scroll`. This was discovered by checking the tuidaw project which uses `onMouseScroll` successfully.

## Implementation Notes

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
