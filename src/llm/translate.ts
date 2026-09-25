import type { LlmProvider } from "./types.js";

// Localizes a short, fixed English text. Falls back to the English text when the LLM is
// unavailable, so system messages always get through.
export async function translate(llm: LlmProvider, language: string, text: string): Promise<string> {
  if (language.toLowerCase().startsWith("en")) {
    return text;
  }

  try {
    const response = await llm.complete({
      system: `Translate the user's message into the language with code "${language}". Keep event titles, place names, people's names, numbers, dates and times exactly as they are. Reply with the translation only.`,
      messages: [{ role: "user", content: text }],
      tools: [],
    });
    const translated = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();

    return translated || text;
  } catch {
    return text;
  }
}

