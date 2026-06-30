# Meals — UI components

Components for building and logging meals. This README covers the **meal-creation
UI** (the "Saved Meal" builder and the food picker it opens), which was reworked
to be a true full-screen, readable experience on iOS while still collapsing to a
tidy centered card on laptop/desktop.

## Files

| File | Role |
|------|------|
| `create-preset-dialog.tsx` | The **Create / Edit Saved Meal** dialog. Name a meal, add foods, set servings, see live totals, save. |
| `meal-section.tsx` | A meal group on the day view (e.g. Breakfast) and its logged items. |
| `meal-time-picker.tsx` | Time-of-day picker for a logged meal. |
| `../food/food-picker-dialog.tsx` | The **Add Food** picker opened from the builder (and from meal logging). Search the personal library, scan a barcode, or pick a saved meal, then choose servings/units. |
| `../ui/dialog.tsx` | Shared Radix dialog primitive. Owns the new `fullscreenOnMobile` variant (below). |

## The `fullscreenOnMobile` dialog variant

Both meal dialogs previously used a small centered modal
(`w-[95vw] max-h-[80vh]`), which on a phone left a cramped box that **truncated
food names** ("Members M…") and wasted most of the screen.

`DialogContent` now accepts an opt-in prop:

```tsx
<DialogContent fullscreenOnMobile>…</DialogContent>
```

Behavior:

- **Phones (`< sm`):** a true full-screen sheet — `fixed top-0 left-0 h-[100dvh]
  w-screen`, no rounding/border, slides up from the bottom.
- **Tablet / laptop (`>= sm`):** collapses to a centered card —
  `max-w-2xl`, `max-h-[85vh]`, rounded, with the usual zoom animation.
- The variant sets `p-0 gap-0`, so **each dialog supplies its own
  header / body / footer padding**. The intended layout is three flex children:

  ```
  DialogContent (flex flex-col)
  ├── DialogHeader   flex-shrink-0  border-b   (sticky header)
  ├── <div>          flex-1 min-h-0 overflow-y-auto   (scrolling body)
  └── <div>          flex-shrink-0  border-t   (pinned footer / primary action)
  ```

The prop is **default-off and backward compatible** — every other dialog in the
app is unaffected.

### Why `100dvh` and not `100vh`

`100vh` on iOS Safari includes the area behind the URL bar, so a `100vh` sheet
gets clipped. `100dvh` (dynamic viewport height) tracks the *visible* viewport,
which is also correct inside the installed PWA.

### iOS safe areas

The app sets `appleWebApp.statusBarStyle: "black"` (see `src/app/layout.tsx`) and
does **not** use `viewport-fit: cover`, so iOS already insets the web view from
the notch and home indicator. As defense-in-depth, the builder's pinned footer
also pads the bottom with
`pb-[max(0.75rem,env(safe-area-inset-bottom))]` so the primary button always
clears the home bar even if `viewport-fit` is enabled later.

## Readability rules

- **Never `truncate` a food or meal name.** Names like "Members Mark 93% Lean
  Ground Beef" must be legible. Use `line-clamp-2 break-words` (wraps to two
  lines, then ellipsizes) for names, and `line-clamp-1` for secondary
  one-line previews (e.g. a saved meal's comma-separated contents).
- Per-item macro lines show the full set — `cal · P · C · F` — now that there is
  horizontal room.

## Servings stepper

Each food row in the builder uses a `[ − ] [ input ] [ + ]` stepper instead of a
bare number field — larger touch targets for iOS, while the middle input still
accepts typed values. Steps are `0.25`; the `−`/`+` handlers round to two
decimals (`Math.round(v * 100) / 100`) to avoid floating-point drift, and `−` is
disabled at the `0.25` minimum.

## When editing these dialogs

- Keep the **three-section flex layout** (sticky header, scrolling body, pinned
  footer). Don't move the primary action into the scroll area — on a phone it
  should always sit in the thumb zone at the bottom.
- The food picker is opened **nested** inside the builder (`mode="food-only"`).
  Both are `fullscreenOnMobile`, so adding a food is a full-screen step over a
  full-screen builder — intended.
- If you add another meal/food dialog, reuse `fullscreenOnMobile` rather than
  re-deriving the sizing classes, so the behavior stays consistent.
