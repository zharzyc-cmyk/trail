export class JsonParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "JsonParseError";
    this.raw = raw;
  }
}

export function stripCodeFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/, "");
  }
  return t.trim();
}

export function parseJsonFromLLM<T>(text: string): T {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new JsonParseError(`AI 返回的内容不是合法 JSON: ${msg}`, text);
  }
}
