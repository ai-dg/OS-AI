# School Data Reference

Loaded when working in `src/projects/schoolData.ts` or seeding demo content.

This file documents all pre-authored content for the JARVIS school demo. Every piece of
copy, every QCM question, every lesson beat is defined here. `schoolData.ts` is the only
place it lives — nothing is hardcoded in components.

---

## Student

```
Name:     Alex Dupont
Age:      16
School:   Lycée Victor Hugo
```

---

## Projects (Subject Folders)

### History
```
Teacher:  Ms. Martin
Email:    s.martin@lycee-victor.fr
```

**Homework: WW2 — QCM**
- Type: `qcm`
- Due: Today, 5pm
- Initial progress: 60% (3 of 7 questions pre-answered)
- Pre-answered correctly: Q1 (index 2), Q2 (index 1), Q3 (index 2)

| Q# | Image | Question | Options | Correct |
|----|-------|----------|---------|---------|
| Q1 | — | When did the First World War end? | 1916 / 1917 / **1918** / 1919 | 1918 |
| Q2 | — | What event is considered the immediate trigger of WW2? | Assassination of Franz Ferdinand / **Invasion of Poland** / Attack on Pearl Harbor / Fall of France | Invasion of Poland |
| Q3 | — | Which alliance did Italy, Germany and Japan form? | The Allies / The Entente / **The Axis** / The Central Powers | The Axis |
| Q4 | MAP: Europe, September 1939 | Which country did Germany invade first to trigger the start of WW2? | France / **Poland** / England / Soviet Union | Poland |
| Q5 | PHOTO: Allied troops, Normandy coast | In which year did the D-Day landings take place? | 1941 / 1943 / **1944** / 1945 | 1944 |
| Q6 | PORTRAIT: British Parliament, 1940s | Who led the United Kingdom as Prime Minister during most of WW2? | Clement Attlee / **Winston Churchill** / Neville Chamberlain / Anthony Eden | Churchill |
| Q7 | PHOTO: VJ Day celebrations, 1945 | When did WW2 officially end? | 1944 / **1945** / 1946 / 1947 | 1945 |

*Q1–Q3 are pre-answered on demo load. The student sees Q4 first.*

---

### Maths
```
Teacher:  Mr. Leconte
Email:    p.leconte@lycee-victor.fr
```

**Homework: Pythagoras Theorem — Lesson**
- Type: `lesson`
- Due: Tomorrow
- Initial progress: 0% (not started)
- Total beats: 5

| Beat | Type | Instruction (ticker text) | SVG Action |
|------|------|--------------------------|------------|
| 0 | draw | "This is a right-angle triangle." | Draw triangle A(15,80) B(80,80) C(80,15), right-angle marker at B, 700ms stroke animation |
| 1 | highlight | "This side is called 'a'. It's one of the two shorter sides." | Highlight segment BC (vertical leg) in purple `#6366f1`, label 'a' right of segment |
| 2 | highlight | "This is 'b'. The other short side." | Highlight segment AB (horizontal leg) in purple `#6366f1`, label 'b' below segment |
| 3 | highlight | "And this is 'c' — the hypotenuse. Always the longest side, opposite the right angle." | Highlight segment AC (diagonal) in amber `#f59e0b`, label 'c' left of segment, larger size |
| 4 | equation | "The square of both short sides, added together, always equals the square of the hypotenuse." | Type equation `a² + b² = c²` character by character (60ms/char), draw connector lines to a/b/c labels |

**SVG Coordinate System:**
- Origin: top-left of SVG canvas
- Coordinates are % of SVG dimensions (0–100 in both axes)
- Triangle vertices (% coords):
  - A = (15, 80) — bottom left
  - B = (80, 80) — bottom right ← right angle here
  - C = (80, 15) — top right
- Right-angle marker: small square drawn at B, 5×5 units

---

### English
```
Teacher:  Ms. Thompson
Email:    a.thompson@lycee-victor.fr
```

**Homework: The Great Gatsby — Essay**
- Type: `essay`
- Status: Submitted ✓
- Submitted: Yesterday, 11:42pm
- Progress: 100%

---

## Mail (Step 3)

When "send this work to my teacher" is triggered in History:

```
To:       Ms. Martin <s.martin@lycee-victor.fr>
Subject:  WW2 QCM — Alex Dupont
Body:
  Dear Ms. Martin,

  Please find attached my completed QCM on World War 2.
  All 7 questions answered.

  Best regards,
  Alex

Attachment: WW2_QCM_Alex_Dupont.pdf
```

---

## Ticker Lines (pre-authored, per step)

These are the exact strings that stream to the Ticker at each demo beat.
They are the fallback when live AI is not used.

| Step | Trigger | Ticker text |
|------|---------|-------------|
| 0 | (none) | *(silence)* |
| 1 | "What do I need to do today?" | "Good morning, Alex. Here's where you're at today." |
| 2 | "Let's start History homework" | "Picking up where you left off. Question 4 of 7." |
| 3a | "Send to teacher" | "Preparing your submission for Ms. Martin." |
| 3a | *(after compose opens)* | "Ready to send to Ms. Martin. Shall I go ahead?" |
| 3b | "Yes, send it" | "Sent. Ms. Martin will receive it shortly." |
| 4 | "Let's start Maths lesson" | "Starting Pythagoras Theorem. Want a quick visual walkthrough first?" |
| 5 | "Yes, show me" | "Let me walk you through it." |
| 5 Beat 0 | *(auto)* | "This is a right-angle triangle." |
| 5 Beat 1 | *(on OK)* | "This side is called 'a'. It's one of the two shorter sides." |
| 5 Beat 2 | *(on OK)* | "This is 'b'. The other short side." |
| 5 Beat 3 | *(on OK)* | "And this is 'c' — the hypotenuse. Always the longest side, opposite the right angle." |
| 5 Beat 4 | *(on OK)* | "The square of both short sides, added together, always equals the square of the hypotenuse." |
| End | *(after equation)* | "That's Pythagoras. Lesson saved to your Maths folder." |

---

## Voice Button Labels (per step)

These are the exact labels shown on the voice simulation button at each step.
They must match exactly — the presenter reads them aloud.

| Before this step | Button shows |
|---|---|
| Step 1 | `🎤 "What do I need to do today?"` |
| Step 2 | `🎤 "Let's start with the History homework we started yesterday"` |
| Step 3a | `🎤 "Could you send this work to my teacher?"` *(shown after QCM submit)* |
| Step 3b | `🎤 "Yes, send it"` |
| Step 4 | `🎤 "Let's start the new Maths lesson on Pythagoras Theorem"` |
| Step 5 | `🎤 "Yes, show me"` |
| Beat confirm | `🎤 "Yes, continue"` *(shown after each lesson beat's OK prompt)* |
| After final beat | *(button disappears — demo is over)* |
