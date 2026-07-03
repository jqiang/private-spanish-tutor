// Core data types shared between the API routes and the UI.
// The teacher route asks Claude to return exactly this shape via a tool schema.

export type CorrectionType =
  | "grammar"
  | "vocabulary"
  | "naturalness"
  | "spelling";

export interface Correction {
  original: string; // what the user said
  corrected: string; // natural Latin American Spanish version
  explanation: string; // short, in English
  type: CorrectionType;
}

export type VocabSource =
  | "asked" // user asked "how do I say X"
  | "code-switch" // user dropped an English word into Spanish
  | "circumlocution" // user paraphrased around a missing word
  | "introduced"; // new word appeared in the teacher's reply

export interface VocabGap {
  spanish: string; // the word/phrase the learner lacked
  english: string;
  example: string; // example sentence in Spanish
  source: VocabSource;
}

export interface TeacherResponse {
  corrections: Correction[]; // empty if the utterance was fine
  vocab_gaps: VocabGap[]; // max 3/turn, empty if none
  answer: string | null; // answer to the user's question (English + Spanish examples)
  reply: string; // conversational continuation, Spanish only
  reply_translation: string; // English gloss, collapsible in UI
}

export type CefrLevel = "A1" | "A2" | "B1" | "B2";

// A chat message as the client tracks it.
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  text: string;
  // Present only on assistant turns.
  teacher?: TeacherResponse;
}

// Wire format sent to /api/chat (metadata stripped to save tokens).
export interface ChatTurn {
  role: ChatRole;
  text: string;
}
