import type Anthropic from "@anthropic-ai/sdk";

// Tool schema Claude must call to return a structured TeacherResponse.
// Using forced tool-use (works on claude-sonnet-4-6) rather than output_config.format.
export const TEACHER_TOOL_NAME = "record_teacher_response";

export const teacherTool: Anthropic.Tool = {
  name: TEACHER_TOOL_NAME,
  description:
    "Record the teacher's structured response to the learner's message: corrections, vocabulary gaps, an optional answer, the Spanish reply, and its English translation.",
  input_schema: {
    type: "object",
    properties: {
      corrections: {
        type: "array",
        description:
          "Real mistakes in the user's utterance. Empty array if nothing to correct. Max 3.",
        items: {
          type: "object",
          properties: {
            original: { type: "string", description: "What the user said." },
            corrected: {
              type: "string",
              description: "Natural Latin American Spanish version.",
            },
            explanation: {
              type: "string",
              description: "Short explanation, in English.",
            },
            type: {
              type: "string",
              enum: ["grammar", "vocabulary", "naturalness", "spelling"],
            },
          },
          required: ["original", "corrected", "explanation", "type"],
        },
      },
      vocab_gaps: {
        type: "array",
        description:
          "Vocabulary the learner lacked this turn. Empty array if none. Max 3.",
        items: {
          type: "object",
          properties: {
            spanish: {
              type: "string",
              description: "The word/phrase the learner lacked.",
            },
            english: { type: "string" },
            example: {
              type: "string",
              description: "Example sentence in Spanish.",
            },
            source: {
              type: "string",
              enum: ["asked", "code-switch", "circumlocution", "introduced"],
            },
          },
          required: ["spanish", "english", "example", "source"],
        },
      },
      answer: {
        type: ["string", "null"],
        description:
          "Answer to the user's question in English with Spanish examples, or null if they asked nothing.",
      },
      reply: {
        type: "string",
        description:
          "Conversational continuation in Spanish only, 1-3 sentences, ending with a follow-up question.",
      },
      reply_translation: {
        type: "string",
        description: "English translation of reply.",
      },
    },
    required: [
      "corrections",
      "vocab_gaps",
      "answer",
      "reply",
      "reply_translation",
    ],
  },
};
