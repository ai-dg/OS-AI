# Demo Check

Run a full pre-demo readiness checklist. Do each step, report pass/fail.

## Checklist

### 1. Environment
- [ ] `npm run dev` starts without errors
- [ ] No TypeScript / ESLint errors in console
- [ ] App loads in browser on `localhost:5173`
- [ ] Canvas fills 100vw × 100vh, no scrollbars

### 2. Voice Input
- [ ] Mic indicator pulses on page load
- [ ] Pressing Space activates listening (mic indicator changes state)
- [ ] Spoken words appear in transcript (check console log)
- [ ] Releasing Space triggers API call

### 3. Claude API → Canvas
- [ ] API call completes without 401/403 errors
- [ ] Ticker streams text sentence by sentence
- [ ] Ticker clears after each sentence
- [ ] At least one widget spawns on canvas after response

### 4. Widget System
- [ ] `text-block` spawns and despawns with correct animation
- [ ] `bullet-list` items stagger in one by one
- [ ] `stat-card` number renders at 48px
- [ ] `code-block` shows monospace code
- [ ] `email-ui` card renders sender/subject/preview
- [ ] `arrow` draws between two widget ids
- [ ] Zoom command centers and scales target widget
- [ ] Zoom-out restores all widgets to full opacity

### 5. Gmail MCP
- [ ] Say "Show me my emails" — MCP call fires (check network tab)
- [ ] Real email cards appear on canvas (not fallback placeholders)
- [ ] Multiple emails stagger in with 200ms delay between each

### 6. Project Switch
- [ ] `Cmd+1` switches to Email project (scan-line plays, label updates)
- [ ] `Cmd+2` switches to Code Review project
- [ ] `Cmd+3` switches to Hackathon Pitch project
- [ ] Canvas state is saved and restored correctly on re-switch
- [ ] Project name label visible top-left (opacity ~0.25)

### 7. Conversation Tree
- [ ] New node appears after each Claude response
- [ ] Active node glows
- [ ] Clicking a past node restores that canvas state with animation
- [ ] Tree resets correctly on project switch

### 8. Demo Mode
- [ ] Press `D` to enter demo mode — step counter appears
- [ ] Right arrow advances steps
- [ ] Each step loads the correct scripted canvas state
- [ ] `Escape` exits demo mode cleanly

### 9. Visual Polish
- [ ] No white backgrounds visible anywhere
- [ ] All widget transitions are smooth (no flash or jump)
- [ ] Particle background animates at 60fps (check performance tab)
- [ ] Project switch scan-line plays cleanly

### 10. Failure Recovery
- [ ] Disconnect internet → API error → fallback text-block appears, no crash
- [ ] Malformed JSON from API → fallback widget, no blank screen

## Report Format
List each section with ✅ PASS or ❌ FAIL + one-line note on failures.
If any P0 item fails, fix it before marking demo-ready.
