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
  t = t.trim();
  // Claude 偶尔在 JSON 前后加说明文字。截取 JSON 主体（object 或 array）。
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  const hasObj = objStart !== -1 && objEnd > objStart;
  const hasArr = arrStart !== -1 && arrEnd > arrStart;
  if (hasObj && hasArr) {
    // 两种都有，挑先出现的那个起点
    return objStart < arrStart ? t.slice(objStart, objEnd + 1) : t.slice(arrStart, arrEnd + 1);
  }
  if (hasObj) return t.slice(objStart, objEnd + 1);
  if (hasArr) return t.slice(arrStart, arrEnd + 1);
  return t;
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
