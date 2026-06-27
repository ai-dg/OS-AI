// Minimal Web Speech API typings (not in lib.dom for all TS versions).

interface SpeechRecognitionResultLike {
  readonly transcript: string;
}
interface SpeechRecognitionAlternativeList {
  readonly length: number;
  item(i: number): SpeechRecognitionResultLike;
  [i: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionResultEntry {
  readonly isFinal: boolean;
  readonly length: number;
  item(i: number): SpeechRecognitionResultLike;
  [i: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(i: number): SpeechRecognitionResultEntry;
  [i: number]: SpeechRecognitionResultEntry;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
