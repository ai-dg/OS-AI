# Project Folders System

Loaded when working in `src/projects/`.

> **Stack note.** State lives in a **Zustand** store, `useProjectStore` (`src/projects/projectStore.ts`),
> imported via the `@/` alias (`import { useProjectStore } from "@/projects/projectStore"`). Outside
> React, read/write it with `useProjectStore.getState()`. The store already exposes
> `getActiveContext()`, which `converse.ts` injects into `buildSystemPrompt(...)` — wire the school
> context through that, not a separate string. The seed data is plain TypeScript in `schoolData.ts`.

## Concept
Projects are **subject folders** — each represents one school class. They are invisible to the
user as a navigation concept: no menu, no list, no tabs. Switching subjects feels like a scene
cut. The canvas wipes, new context loads, and the agent instantly knows what you're working on.

The only visible trace of the active project is a tiny label top-left:
- Font: 10px monospace
- Color: `rgba(255,255,255,0.25)`
- No background, no border
- Fades in over 600ms on switch

---

## School Data — Pre-Seeded Demo

Everything lives in `src/projects/schoolData.ts`. This is the single source of truth for
all demo content. Claude Code must generate this file with the exact data below.

```ts
// src/projects/schoolData.ts

export interface Teacher {
  name: string
  email: string
  subject: string
}

export type HomeworkType = 'qcm' | 'lesson' | 'essay'

export interface QCMQuestion {
  text: string
  imagePlaceholder?: string
  options: string[]
  correctIndex: number
}

export interface QCMData {
  subject: string
  questions: QCMQuestion[]
  answers: Record<number, number>   // questionIndex → chosen option (0-indexed)
}

export interface LessonBeat {
  type: 'draw' | 'highlight' | 'equation'
  instruction: string
  svgCommand?: object
  equation?: string
}

export interface LessonData {
  subject: string
  beats: LessonBeat[]
  currentBeat: number
}

export interface EssayData {
  subject: string
  submitted: boolean
  submittedAt?: string
}

export interface Homework {
  id: string
  type: HomeworkType
  title: string
  dueDate: string
  dueLabel: string
  data: QCMData | LessonData | EssayData
}

export interface SchoolProject {
  id: string
  name: string
  teacher: Teacher
  homeworks: Homework[]
  history: Array<{ role: string; content: string }>
  canvasState: unknown[]
  tree: unknown[]
  activeNodeId: string | null
}

// ─── Progress Computation ───────────────────────────────────────────────────

export function computeProgress(homework: Homework): number {
  if (homework.type === 'essay') {
    return (homework.data as EssayData).submitted ? 100 : 0
  }
  if (homework.type === 'qcm') {
    const d = homework.data as QCMData
    const answered = Object.keys(d.answers).length
    return Math.round((answered / d.questions.length) * 100)
  }
  if (homework.type === 'lesson') {
    const d = homework.data as LessonData
    return Math.round((d.currentBeat / d.beats.length) * 100)
  }
  return 0
}

// ─── Default School Data ────────────────────────────────────────────────────

export function createDefaultSchoolData(): Record<string, SchoolProject> {
  return {
    history: {
      id: 'history',
      name: 'History',
      teacher: {
        name: 'Ms. Martin',
        email: 's.martin@lycee-victor.fr',
        subject: 'History'
      },
      homeworks: [
        {
          id: 'hw-ww2-qcm',
          type: 'qcm',
          title: 'WW2 — QCM',
          dueDate: 'today',
          dueLabel: 'Today, 5pm',
          data: {
            subject: 'World War 2',
            questions: [
              {
                text: 'When did the First World War end?',
                options: ['1916', '1917', '1918', '1919'],
                correctIndex: 2
              },
              {
                text: 'What event is considered the immediate trigger of WW2?',
                options: [
                  'The assassination of Franz Ferdinand',
                  'The invasion of Poland',
                  'The attack on Pearl Harbor',
                  'The fall of France'
                ],
                correctIndex: 1
              },
              {
                text: 'Which alliance did Italy, Germany and Japan form?',
                options: ['The Allies', 'The Entente', 'The Axis', 'The Central Powers'],
                correctIndex: 2
              },
              {
                text: 'Which country did Germany invade first to trigger the start of WW2?',
                imagePlaceholder: 'MAP: Europe, September 1939',
                options: ['France', 'Poland', 'England', 'Soviet Union'],
                correctIndex: 1
              },
              {
                text: 'In which year did the D-Day landings take place?',
                imagePlaceholder: 'PHOTO: Allied troops, Normandy coast',
                options: ['1941', '1943', '1944', '1945'],
                correctIndex: 2
              },
              {
                text: 'Who led the United Kingdom as Prime Minister during most of WW2?',
                imagePlaceholder: 'PORTRAIT: British Parliament, 1940s',
                options: [
                  'Clement Attlee',
                  'Winston Churchill',
                  'Neville Chamberlain',
                  'Anthony Eden'
                ],
                correctIndex: 1
              },
              {
                text: 'When did WW2 officially end?',
                imagePlaceholder: 'PHOTO: VJ Day celebrations, 1945',
                options: ['1944', '1945', '1946', '1947'],
                correctIndex: 1
              }
            ],
            // Questions 0-2 already answered correctly (= 60% progress)
            answers: { 0: 2, 1: 1, 2: 2 }
          } as QCMData
        }
      ],
      history: [],
      canvasState: [],
      tree: [],
      activeNodeId: null
    },

    maths: {
      id: 'maths',
      name: 'Maths',
      teacher: {
        name: 'Mr. Leconte',
        email: 'p.leconte@lycee-victor.fr',
        subject: 'Mathematics'
      },
      homeworks: [
        {
          id: 'hw-pythagoras',
          type: 'lesson',
          title: 'Pythagoras Theorem — Lesson',
          dueDate: 'tomorrow',
          dueLabel: 'Tomorrow',
          data: {
            subject: 'Pythagoras Theorem',
            currentBeat: 0,
            beats: [
              {
                type: 'draw',
                instruction: 'This is a right-angle triangle.',
                svgCommand: {
                  shape: 'right-triangle',
                  vertices: { A: [15, 80], B: [80, 80], C: [80, 15] },
                  strokeColor: 'rgba(255,255,255,0.85)',
                  animationMs: 700,
                  rightAngleMarker: 'B'
                }
              },
              {
                type: 'highlight',
                instruction: "This side is called 'a'. It's one of the two shorter sides.",
                svgCommand: {
                  highlightSegment: 'BC',
                  glowColor: '#6366f1',
                  label: { text: 'a', position: 'right-of-segment', size: 'normal' }
                }
              },
              {
                type: 'highlight',
                instruction: "This is 'b'. The other short side.",
                svgCommand: {
                  highlightSegment: 'AB',
                  glowColor: '#6366f1',
                  label: { text: 'b', position: 'below-segment', size: 'normal' }
                }
              },
              {
                type: 'highlight',
                instruction: "And this is 'c' — the hypotenuse. Always the longest side, opposite the right angle.",
                svgCommand: {
                  highlightSegment: 'AC',
                  glowColor: '#f59e0b',
                  label: { text: 'c', position: 'left-of-segment', size: 'large' }
                }
              },
              {
                type: 'equation',
                instruction: "The square of both short sides, added together, always equals the square of the hypotenuse.",
                equation: 'a² + b² = c²'
              }
            ]
          } as LessonData
        }
      ],
      history: [],
      canvasState: [],
      tree: [],
      activeNodeId: null
    },

    english: {
      id: 'english',
      name: 'English',
      teacher: {
        name: 'Ms. Thompson',
        email: 'a.thompson@lycee-victor.fr',
        subject: 'English Literature'
      },
      homeworks: [
        {
          id: 'hw-gatsby-essay',
          type: 'essay',
          title: 'The Great Gatsby — Essay',
          dueDate: 'submitted',
          dueLabel: 'Submitted ✓',
          data: {
            subject: 'The Great Gatsby',
            submitted: true,
            submittedAt: 'Yesterday, 11:42pm'
          } as EssayData
        }
      ],
      history: [],
      canvasState: [],
      tree: [],
      activeNodeId: null
    }
  }
}
```

---

## State Shape

```ts
// src/projects/projectStore.ts

interface ProjectStore {
  activeProjectId: string
  projects: Record<string, SchoolProject>
  setActiveProject: (id: string) => void
  updateHomeworkProgress: (projectId: string, homeworkId: string, data: Partial<QCMData | LessonData>) => void
  saveCanvasState: (projectId: string, widgets: Widget[]) => void
  reset: () => void           // called by demoStore.reset()
}
```

On `reset()`: replace all projects with a fresh `createDefaultSchoolData()` call and clear
all history, canvasState, and tree arrays.

---

## Switch Triggers

**Scripted demo:** the `demoStore` switches projects automatically as part of each step's
`onEnter()` function. No user action needed.

**Voice (live AI mode):** If Claude's response includes a `switch-project` canvas action,
the canvas renderer calls `projectStore.setActiveProject(projectId)`.

**Keyboard (presenter override):**
- `Cmd+1` → `history`
- `Cmd+2` → `maths`
- `Cmd+3` → `english`

---

## Switch Sequence (unchanged from original)

```
Total duration: ~950ms

1. [0ms]    Save current canvas widgets to outgoing project's canvasState
2. [0ms]    Save current history to outgoing project's history
3. [0ms]    Begin widget fade-out: ALL widgets opacity 1→0 over 250ms simultaneously
4. [0ms]    Begin scan-line: 1px white line (opacity 0.15) sweeps top→bottom over 400ms
5. [250ms]  Canvas is clear — set activeProjectId to new project
6. [300ms]  Mic indicator pulses once (scale 1→1.3→1, 300ms)
7. [400ms]  Scan-line completes
8. [450ms]  Restore new project's canvasState — widgets spawn with 50ms stagger
9. [450ms]  Swap Claude history to new project's history
10.[450ms]  Update system prompt context string to new project's teacher + homework context
11.[500ms]  Project name label fades in top-left over 600ms
```

---

## localStorage Persistence

Key format: `jarvis_project_{id}` — only write `history`, `canvasState`, `tree`, `activeNodeId`.
Do not persist `teacher`, `homeworks` (loaded fresh from `schoolData.ts` on every init).
This means homework answers and lesson progress are in-memory only — reset on page reload.
For the demo this is intentional: `Reset Demo` always gives a clean state.

---

## System Prompt Context Injection

When switching projects, update the system prompt's context section:

```ts
function buildProjectContext(project: SchoolProject): string {
  const hw = project.homeworks.map(h => {
    const progress = computeProgress(h)
    return `- ${h.title} (${h.type}, ${progress}% complete, due: ${h.dueLabel})`
  }).join('\n')

  return `
ACTIVE CLASS: ${project.name}
TEACHER: ${project.teacher.name} <${project.teacher.email}>
HOMEWORKS:
${hw}

You are helping a student with their ${project.name} coursework. Spawn widgets appropriate
to the task type: 'qcm' for quizzes, 'lesson' for interactive lessons, 'mail-compose' when
the student wants to email their teacher. Always use the teacher's real name and email.
  `.trim()
}
```
