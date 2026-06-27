# Debug Canvas

Diagnose and fix issues with the Claude API → canvas render loop.

## Diagnostic Steps

1. **Check the raw API response**
   - Open `src/ai/claudeClient.js`
   - Add a `console.log('RAW RESPONSE:', buffer)` before the JSON parse
   - Reload and trigger a voice input
   - Paste the raw buffer here for analysis

2. **Check JSON validity**
   - Run the raw response through `JSON.parse()` in browser console
   - If it throws: identify where the JSON is malformed (unclosed string, trailing comma, etc.)
   - Common Claude failure: speech field contains unescaped quotes — fix with `replace(/"/g, '\\"')` before widget section

3. **Check widget render**
   - Open `src/widgets/WidgetRenderer.jsx`
   - Add `console.log('Rendering widget:', widget)` at the top of the render function
   - Verify each widget in the canvas array is being dispatched

4. **Check canvas state**
   - Open React DevTools → find the `Canvas` component
   - Inspect `widgets` state — are the widgets being added?
   - If yes but not visible: check z-index, opacity, and position values

5. **Check for positioning issues**
   - Widget x/y/w/h should be 0–100 (percentages)
   - If Claude returns pixel values (e.g. `x: 300`), the widget may render off-screen
   - Fix in `src/ai/systemPrompt.js` — reinforce that values are percentages

6. **Common fixes**
   - No widgets appearing: Claude returned text outside the JSON — check system prompt
   - Widget at wrong position: `x`/`y` values > 100 or negative — add clamp in WidgetRenderer
   - Ticker not streaming: check streaming parser is extracting `speech` field correctly
   - MCP not firing: check `mcp_servers` array is in the API request body

## If All Else Fails
Add a hardcoded test widget directly to canvas state to isolate the issue:
```js
// In Canvas.jsx useEffect or a test button:
dispatchWidget({ action: 'spawn', type: 'text-block', id: 'test', x: 30, y: 30, w: 40, h: 20, data: { title: 'Test', body: 'Widget system works' } })
```
If this renders correctly, the issue is upstream (API/parsing). If it doesn't, the issue is in WidgetRenderer.
