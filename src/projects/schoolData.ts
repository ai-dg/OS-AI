/**
 * School Data — single source of truth for the JARVIS school demo.
 *
 * Every piece of pre-authored demo content (teachers, homework, QCM questions,
 * lesson beats) lives here. Components and stores read from this file; nothing
 * is hardcoded elsewhere. See .claude/docs/SCHOOL_DATA.md for the spec.
 */

export interface Teacher {
  name: string;
  email: string;
  subject: string;
}

export type HomeworkType = "qcm" | "lesson" | "essay";

export interface QCMQuestion {
  text: string;
  imagePlaceholder?: string;
  options: string[];
  correctIndex: number;
}

export interface QCMData {
  subject: string;
  questions: QCMQuestion[];
  /** questionIndex → chosen option (0-indexed) */
  answers: Record<number, number>;
}

export interface LessonBeat {
  type: "draw" | "highlight" | "equation";
  instruction: string;
  svgCommand?: Record<string, unknown>;
  equation?: string;
}

export interface LessonData {
  subject: string;
  beats: LessonBeat[];
  currentBeat: number;
}

export interface EssayData {
  subject: string;
  submitted: boolean;
  submittedAt?: string;
}

export type HomeworkData = QCMData | LessonData | EssayData;

export interface Homework {
  id: string;
  type: HomeworkType;
  title: string;
  dueDate: string;
  dueLabel: string;
  data: HomeworkData;
}

export interface SchoolProject {
  id: string;
  name: string;
  teacher: Teacher;
  homeworks: Homework[];
  history: Array<{ role: string; content: string }>;
  canvasState: unknown[];
  tree: unknown[];
  activeNodeId: string | null;
}

// ─── Progress Computation ───────────────────────────────────────────────────

export function computeProgress(homework: Homework): number {
  if (homework.type === "essay") {
    return (homework.data as EssayData).submitted ? 100 : 0;
  }
  if (homework.type === "qcm") {
    const d = homework.data as QCMData;
    const answered = Object.keys(d.answers).length;
    return Math.round((answered / d.questions.length) * 100);
  }
  if (homework.type === "lesson") {
    const d = homework.data as LessonData;
    return Math.round((d.currentBeat / d.beats.length) * 100);
  }
  return 0;
}

// ─── Default School Data ────────────────────────────────────────────────────

export function createDefaultSchoolData(): Record<string, SchoolProject> {
  return {
    history: {
      id: "history",
      name: "History",
      teacher: {
        name: "Ms. Martin",
        email: "s.martin@lycee-victor.fr",
        subject: "History",
      },
      homeworks: [
        {
          id: "hw-ww2-qcm",
          type: "qcm",
          title: "WW2 — QCM",
          dueDate: "today",
          dueLabel: "Today, 5pm",
          data: {
            subject: "World War 2",
            questions: [
              {
                text: "When did the First World War end?",
                options: ["1916", "1917", "1918", "1919"],
                correctIndex: 2,
              },
              {
                text: "What event is considered the immediate trigger of WW2?",
                options: [
                  "The assassination of Franz Ferdinand",
                  "The invasion of Poland",
                  "The attack on Pearl Harbor",
                  "The fall of France",
                ],
                correctIndex: 1,
              },
              {
                text: "Which alliance did Italy, Germany and Japan form?",
                options: ["The Allies", "The Entente", "The Axis", "The Central Powers"],
                correctIndex: 2,
              },
              {
                text: "Which country did Germany invade first to trigger the start of WW2?",
                imagePlaceholder: "MAP: Europe, September 1939",
                options: ["France", "Poland", "England", "Soviet Union"],
                correctIndex: 1,
              },
              {
                text: "In which year did the D-Day landings take place?",
                imagePlaceholder: "PHOTO: Allied troops, Normandy coast",
                options: ["1941", "1943", "1944", "1945"],
                correctIndex: 2,
              },
              {
                text: "Who led the United Kingdom as Prime Minister during most of WW2?",
                imagePlaceholder: "PORTRAIT: British Parliament, 1940s",
                options: [
                  "Clement Attlee",
                  "Winston Churchill",
                  "Neville Chamberlain",
                  "Anthony Eden",
                ],
                correctIndex: 1,
              },
              {
                text: "When did WW2 officially end?",
                imagePlaceholder: "PHOTO: VJ Day celebrations, 1945",
                options: ["1944", "1945", "1946", "1947"],
                correctIndex: 1,
              },
            ],
            // Questions 0-2 already answered correctly (= 43% progress, 3 of 7)
            answers: { 0: 2, 1: 1, 2: 2 },
          } as QCMData,
        },
      ],
      history: [],
      canvasState: [],
      tree: [],
      activeNodeId: null,
    },

    maths: {
      id: "maths",
      name: "Maths",
      teacher: {
        name: "Mr. Leconte",
        email: "p.leconte@lycee-victor.fr",
        subject: "Mathematics",
      },
      homeworks: [
        {
          id: "hw-pythagoras",
          type: "lesson",
          title: "Pythagoras Theorem — Lesson",
          dueDate: "tomorrow",
          dueLabel: "Tomorrow",
          data: {
            subject: "Pythagoras Theorem",
            currentBeat: 0,
            beats: [
              {
                type: "draw",
                instruction: "This is a right-angle triangle.",
                svgCommand: {
                  shape: "right-triangle",
                  vertices: { A: [15, 80], B: [80, 80], C: [80, 15] },
                  strokeColor: "rgba(255,255,255,0.85)",
                  animationMs: 700,
                  rightAngleMarker: "B",
                },
              },
              {
                type: "highlight",
                instruction: "This side is called 'a'. It's one of the two shorter sides.",
                svgCommand: {
                  highlightSegment: "BC",
                  glowColor: "#6366f1",
                  label: { text: "a", position: "right-of-segment", size: "normal" },
                },
              },
              {
                type: "highlight",
                instruction: "This is 'b'. The other short side.",
                svgCommand: {
                  highlightSegment: "AB",
                  glowColor: "#6366f1",
                  label: { text: "b", position: "below-segment", size: "normal" },
                },
              },
              {
                type: "highlight",
                instruction:
                  "And this is 'c' — the hypotenuse. Always the longest side, opposite the right angle.",
                svgCommand: {
                  highlightSegment: "AC",
                  glowColor: "#f59e0b",
                  label: { text: "c", position: "left-of-segment", size: "large" },
                },
              },
              {
                type: "equation",
                instruction:
                  "The square of both short sides, added together, always equals the square of the hypotenuse.",
                equation: "a² + b² = c²",
              },
            ],
          } as LessonData,
        },
      ],
      history: [],
      canvasState: [],
      tree: [],
      activeNodeId: null,
    },

    english: {
      id: "english",
      name: "English",
      teacher: {
        name: "Ms. Thompson",
        email: "a.thompson@lycee-victor.fr",
        subject: "English Literature",
      },
      homeworks: [
        {
          id: "hw-gatsby-essay",
          type: "essay",
          title: "The Great Gatsby — Essay",
          dueDate: "submitted",
          dueLabel: "Submitted ✓",
          data: {
            subject: "The Great Gatsby",
            submitted: true,
            submittedAt: "Yesterday, 11:42pm",
          } as EssayData,
        },
      ],
      history: [],
      canvasState: [],
      tree: [],
      activeNodeId: null,
    },
  };
}
