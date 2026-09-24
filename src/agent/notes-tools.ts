import { z } from "zod";
import type { NotesProvider } from "../notes/index.js";
import { defineTool, type Tool } from "./tool.js";

export function createNotesTools(notes: NotesProvider, userId: number): Tool[] {
  return [
    defineTool(
      {
        name: "add_note",
        description: 'Save a note or reminder tied to a context, e.g. text "milk", context "market".',
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            context: { type: "string", description: "Place or topic the note belongs to." },
          },
          required: ["text"],
        },
      },
      z.object({ text: z.string().min(1), context: z.string().min(1).optional() }),
      (args) => notes.add(userId, args),
    ),
    defineTool(
      {
        name: "list_notes",
        description: "List saved notes. With a query, returns notes whose text or context contains it.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      },
      z.object({ query: z.string().optional() }),
      ({ query }) => notes.list(userId, query),
    ),
    defineTool(
      {
        name: "remove_note",
        description: "Remove one note by id, e.g. once the user has done it.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "number", description: "Note id from list_notes." } },
          required: ["id"],
        },
      },
      z.object({ id: z.number().int() }),
      ({ id }) => ({ removed: notes.remove(userId, id) }),
    ),
    defineTool(
      {
        name: "remove_all_notes",
        description: "Remove every saved note in one call. Irreversible: confirm with the user first.",
        inputSchema: { type: "object", properties: {} },
      },
      z.object({}),
      () => ({ removed: notes.removeAll(userId) }),
    ),
  ];
}

