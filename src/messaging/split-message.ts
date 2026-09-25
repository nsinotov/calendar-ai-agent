// Splits text into chunks of at most `limit` characters, preferring line breaks.
export function splitMessage(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let rest = text;

  while (rest.length > limit) {
    const lineBreak = rest.lastIndexOf("\n", limit);
    const cut = lineBreak > 0 ? lineBreak : limit;

    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) {
    chunks.push(rest);
  }

  return chunks;
}

