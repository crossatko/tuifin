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
- CardRow: `onMouseMove` on container calls `this.focus()`
- MediaList: `onMouseMove` on listPanel calls `this.select?.focus()`
- Login: `onMouseDown` on field rows calls `this.focusCurrentInput()`

This eliminates the need to keyboard-navigate to components before using the mouse.

### Event Handling
- **Hover**: Updates `selectedIndex` for visual feedback
- **Click**: Triggers selection actions (`onSelect`, form submission)
- **Scroll wheel**: Handled via `event.scroll.direction` ("up"/"down")
  - CardRow: Horizontal scrolling (left/right through cards)
  - MediaList: Vertical scrolling (up/down through list items)

## Testing Results

- [x] Home screen: hover any row auto-focuses it
- [x] Home screen: hover cards shows highlight
- [x] Home screen: click card opens it
- [x] Home screen: scroll wheel moves between cards horizontally
- [x] Library screen: hover list auto-focuses it
- [x] Library screen: click items in list
- [x] Library screen: scroll wheel in list (vertical)
- [x] Detail screen (Season): hover/click episodes
- [x] Detail screen: scroll wheel
- [x] Login screen: click field rows to focus inputs
- [x] Login screen: click between server/username/password fields

## Implementation Notes

### MediaList Click Detection
Clicking list items calculates the clicked index from Y position:
```typescript
const itemHeight = 3 // Approximate rows per item (name + desc + spacing)
const relativeY = event.y - listPanel.y
const clickedIndex = Math.floor(relativeY / itemHeight)
```

This works because SelectRenderable has a predictable layout. More precise
detection would require SelectRenderable to expose its layout metrics.

### Scroll Wheel Direction
- `event.scroll.direction === "up"` = scroll content down (show earlier items)
- `event.scroll.direction === "down"` = scroll content up (show later items)

For CardRow horizontal scrolling:
- Wheel up → scroll left (decrement offset)
- Wheel down → scroll right (increment offset)

