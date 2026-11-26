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
    text = text.replace(new RegExp(escaped, "gi"), () => r);
  }
  // Suppress spaces before a spoken line break, and leading whitespace after a keyword.
  text = text.replace(/[ \\t]+\\n/g, "\\n").replace(/^[ \\t]+/, "");
  text = text.replace(/[.!?…]\s*\n*[a-zà-ÿ]/g, match => match.toUpperCase());
  text = text.replace(/#M\s*([a-zà-ÿ])/gi, (_, letter) => letter.toUpperCase());
  text = text.replace(/^(\s*)([a-zà-ÿ])/i, (_, spaces, letter) => spaces + letter.toUpperCase());
  text = text.replace(/\s([.!?,:;…])/g, "$1");
  return text;
}
