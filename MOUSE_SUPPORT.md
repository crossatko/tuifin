# Mouse Support Implementation

## Completed

### CardRow (Home Screen Cards)
✅ **Hover** - Moving mouse over cards updates selection highlight
✅ **Click** - Clicking a card triggers the onSelect action  
✅ **Horizontal Scroll** - Mouse wheel up/down scrolls cards left/right

## To Test

### SelectRenderable (MediaList)
SelectRenderable is a core OpenTUI component that should have built-in mouse support:
- Clicking items should select them
- Mouse wheel should scroll the list vertically
- Need to verify this works without explicit handlers

### Login Screen Inputs
InputRenderable should handle click-to-focus automatically as a core component.
Need to verify clicking input fields focuses them.

## Not Yet Implemented

### MediaList Preview Sidebar
- Could add click-to-dismiss or other interactions

### Detail/Library Screens
- Scroll wheel should scroll the MediaList
- Clicks should select items

### Status Bar
- No mouse interaction needed (display only)

## Testing Checklist

- [ ] Home screen: hover cards shows highlight
- [ ] Home screen: click card opens it
- [ ] Home screen: scroll wheel moves between cards
- [ ] Library screen: click items in list
- [ ] Library screen: scroll wheel in list
- [ ] Detail screen (Season): click episodes
- [ ] Detail screen: scroll wheel
- [ ] Login screen: click inputs to focus
- [ ] Login screen: click between server/username/password fields

