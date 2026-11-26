// DIT.tafono-compatible voice keyword processing, without TinyMCE or jQuery.
// Rules are applied in stored order, case-insensitively, on final text only.
export function normalizeVoiceCommands(input) {
  if (!Array.isArray(input)) throw new TypeError("Comandi vocali non validi");
  return input.map(item => ({
    t: String(item.t ?? ""),
    r: String(item.r ?? ""),
  }));
}

// Reject output consisting solely of punctuation, symbols or whitespace.
export function isPunctuationOnly(text) {
  const value = String(text ?? "").trim();
  return !value || /^[\p{P}\p{S}\s]+$/u.test(value);
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
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/#M\s*([a-zà-ÿ])/gi, (_, letter) => letter.toLocaleUpperCase("it-IT"));
  return text;
}

// Remove only Edge's automatically appended single full stop, not ellipses.
export function cleanEdgeSegment(raw) {
  const text = String(raw ?? "").trim();
  if (!text || /^\p{P}$/u.test(text)) return "";
  if (text.endsWith(".") && !text.endsWith("..")) return text.slice(0,-1).trimEnd();
  return text;
}

// Edge may add sentence punctuation after a spoken punctuation command.
// Remove that terminal automatic sign before applying the substitution.
// Only consider configured commands that produce a punctuation sign.
export function stripEdgePunctuationAfterCommand(text, commands) {
  const value = String(text ?? "");
  for (const {t, r} of commands) {
    if (!t.trim() || !/^[.!?,;:]/.test(r.trim())) continue;
    const quoted = t.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
    const suffix = new RegExp("(?:^|\\s)" + quoted + "\\s*[.!?]\\s*$", "i");
    if (suffix.test(value)) return value.replace(/[.!?]\s*$/, "");
  }
  return value;
}

// Keep exactly one space after punctuation when more text follows,
// except when the next character is a newline. Ellipses stay intact.
export function reviewPunctuation(text) {
  // Edge can put a full stop before a spoken "punto fermo"; avoid ". .".
  // Ellipses ("...") have no spaces and are preserved.
  const normalized = text.replace(/(?<!\.)\.[ \t]+\.(?!\.)/g, ".")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])[ \t]*/g, (match, punctuation, offset, source) => {
      const next = source[offset + match.length];
      if (!next || next === "\r" || next === "\n") return punctuation;
      if (punctuation === "." && (source[offset - 1] === "." || next === ".")) return match;
      return punctuation + " ";
    });
  return normalized.replace(/([.!?][ \t]+)([a-zà-ÿ])/gi,
    (match, punctuation, letter, offset, source) =>
      punctuation[0] === "." && source[offset - 1] === "."
        ? match : punctuation + letter.toLocaleUpperCase("it-IT"));
}

// Concatenate finalized segments, with sentence-initial casing.
export function appendReviewedSegment(previous, processed, options = {}) {
  if (!processed) return previous;
  const last = previous.trimEnd().slice(-1);
  const startsLine = /^[\r\n]/.test(processed);
  const startsPunct = /^[.,;:!?]/.test(processed);
  const separator = previous && !/\s$/.test(previous) && !startsLine && !startsPunct ? " " : "";
  let next = processed;
  const index = next.search(/[a-zà-ÿ]/i);
  if (index >= 0) {
    const uppercase = !previous.trim() || /[.!?]/.test(last) || !!options.forceUppercase;
    next = next.slice(0,index) +
      (uppercase ? next[index].toLocaleUpperCase("it-IT") : next[index].toLocaleLowerCase("it-IT")) +
      next.slice(index+1);
  }
  return reviewPunctuation(previous + separator + next);
}
