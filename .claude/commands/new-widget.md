# New Widget

Scaffold a new widget type end-to-end.

## Steps

1. Read `.claude/docs/WIDGETS.md` to understand the shared interface and conventions.

2. Ask the user: "What's the widget type name (e.g. `chart`, `calendar-view`) and what data does it need?"

3. Create `src/widgets/<TypeName>Widget.jsx`:
   - Accepts `{ data, style }` props where `style` contains `{ width, height }` in px
   - Uses CSS custom properties from `ANIMATIONS.md` for colors and transitions
   - Implements spawn animation via a `useEffect` that adds a class after mount
   - Implements despawn by accepting an `isDespawning` prop that triggers the exit animation

4. Add the new type to `src/widgets/WidgetRenderer.jsx`:
   - Import the component
   - Add a case to the switch statement
   - Pass `data` and `style` props

5. Add the widget to the system prompt in `src/ai/systemPrompt.js`:
   - Add to the WIDGET TYPES section with its data schema
   - Add one example usage to the EXAMPLE RESPONSE section

6. Confirm: "Widget `<type>` is ready. Claude can now spawn it by using `type: '<type>'` in the canvas array."
