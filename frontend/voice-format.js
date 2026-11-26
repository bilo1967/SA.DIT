// DIT.tafono-compatible voice keyword processing, without TinyMCE or jQuery.
// Rules are applied in stored order, case-insensitively, on final text only.
export function normalizeVoiceCommands(input) {
  if (!Array.isArray(input)) throw new TypeError("Comandi vocali non validi");
  return input.map(item => ({
    t: String(item.t ?? ""),
    r: String(item.r ?? ""),
  }));
}

export function applyVoiceCommands(raw, commands) {
  let text = String(raw ?? "");
  for (const {t, r} of commands) {
    if (!t.trim()) continue;
    // Treat a spoken phrase literally, unlike the historical regex-based editor.
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefix = /^[.,;:!?]/.test(r) ? "[ \\t]*" : "";
    text = text.replace(new RegExp(prefix + escaped, "gi"), () => r);
  }
  // Edge/Chrome punctuation is authoritative: never synthesize punctuation.
  // Trim only spaces immediately preceding explicitly requested line breaks.
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/#M\s*([a-zà-ÿ])/gi, (_, letter) => letter.toUpperCase());
  text = text.replace(/^(\s*)([a-zà-ÿ])/i, (_, spaces, letter) => spaces + letter.toUpperCase());
  return text;
}
