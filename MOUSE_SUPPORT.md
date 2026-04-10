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
  - CardRow: Horizontal scrolling (left/right through cards) + **selection follows cursor**
  - MediaList: Vertical scrolling (up/down through list items) + **selection follows cursor**
  - After scrolling, calculates which item is under the mouse cursor and updates selection
  - Creates natural "scroll under cursor" feel

### Key Discovery
Scroll events require a **separate `onMouseScroll` handler** - they don't come through `onMouseMove` with `event.scroll`. This was discovered by checking the tuidaw project which uses `onMouseScroll` successfully.

## Implementation Notes

### Cursor-Following Scroll
When scrolling with the mouse wheel, the selection follows the cursor:

**CardRow:**
```typescript
// After scrolling, calculate which card is under cursor
const relativeX = event.x - this.container.x
const cardIndex = Math.floor(relativeX / (this.cardWidth + 1)) + this.scrollOffset
this.selectedIndex = cardIndex
```

**MediaList:**
```typescript
// Calculate which item is under cursor Y position
const itemHeight = 3 // Rows per item
const relativeY = event.y - listPanel.y
const hoveredIndex = Math.floor(relativeY / itemHeight)
this.select.setSelectedIndex(hoveredIndex)
```

This creates an intuitive experience where the highlight sticks to the cursor as you scroll.

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
