// Deterministic processing of final Web Speech segments.
// A: clean Edge output; B: protected substitutions; C: normalize cumulative text.
const STRONG_END = /[.!?]+[ \t]*$/u;
const PUNCT_ONLY = /^[\p{P}\p{S}\s]+$/u;
const EXPLICIT_PUNCT = /^[.,;:!?]$/u;
const MARK_START = "\uE000";
const MARK_END = "\uE001";

export function normalizeVoiceCommands(input) {
  if (!Array.isArray(input)) throw new TypeError("Comandi vocali non validi");
  return input.map(item => ({t: String(item.t ?? ""), r: String(item.r ?? "")}));
}

export function isPunctuationOnly(text) {
  const value = String(text ?? "").trim();
  return !value || PUNCT_ONLY.test(value);
}

// A. A final strong sign belongs to Edge, not the interpreter. Remove all of
// them, including repeated signs. Never apply this cleanup after substitutions.
export function cleanEdgeSegment(raw) {
  let text = String(raw ?? "").trim();
  while (STRONG_END.test(text)) text = text.replace(STRONG_END, "").trimEnd();
  return isPunctuationOnly(text) ? "" : text;
}

function quoteRegExp(text) {
  return text.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

// B. Protect explicit punctuation before resolving conflicts. Whitespace in
// replacement values is ignored only for recognizing conventional signs.
// Other replacements (newlines, #M, typographic symbols) remain unchanged.
export function applyVoiceCommands(raw, commands) {
  let text = String(raw ?? "");
  const tokens = [];
  const rules = normalizeVoiceCommands(commands);
  for (const {t, r} of rules) {
    if (!t.trim()) continue;
    const punctuation = r.trim();
    const isExplicit = EXPLICIT_PUNCT.test(punctuation);
    const keyword = new RegExp("(?<![\\p{L}\\p{N}])" + quoteRegExp(t) +
      "(?![\\p{L}\\p{N}])", "giu");
    text = text.replace(keyword, () => {
      if (!isExplicit) return r;
      const token = MARK_START + tokens.length + MARK_END;
      tokens.push(punctuation);
      return token;
    });
  }
  // Edge punctuation directly adjacent to an explicit sign loses precedence.
  // Only original punctuation is consumed: protected tokens are never erased.
  // Do not cross newline boundaries (explicit formatting commands).
  for (let i = 0; i < tokens.length; i++) {
    const marker = MARK_START + i + MARK_END;
    const quoted = quoteRegExp(marker);
    text = text.replace(new RegExp("[\\p{P}\\p{S}]+[ \\t]*" + quoted, "gu"), marker);
    text = text.replace(new RegExp(quoted + "[ \\t]*[\\p{P}\\p{S}]+", "gu"), marker);
  }
  // A conventional sign must never retain whitespace before its marker.
  for (let i = 0; i < tokens.length; i++) {
    const marker = MARK_START + i + MARK_END;
    text = text.replace(new RegExp("[ \\t]+" + quoteRegExp(marker), "g"), marker);
    text = text.replaceAll(marker, tokens[i]);
  }

  return text.replace(/#M[ \t]*([a-zà-ÿ])/giu,
    (_, letter) => letter.toLocaleUpperCase("it-IT"));
}

// C. Whitespace and sentence-initial case are normalized after substitutions.
export function reviewPunctuation(value) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[ \t]+([.,;:!?])/g, "$1");
  text = text.replace(/([.,;:!?])[ \t]*(?=[^\s.,;:!?])/g, "$1 ");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/([.!?][ \t]+)([a-zà-ÿ])/giu,
    (_, punctuation, letter) => punctuation + letter.toLocaleUpperCase("it-IT"));
  return text;
}

export function appendReviewedSegment(previous, processed, options = {}) {
  if (!processed) return previous;
  const before = String(previous ?? "");
  const nextRaw = String(processed);
  // Repeating an isolated command must not append a duplicate terminator.
  if (/^[.!?]\s*$/u.test(nextRaw) && before.trimEnd().endsWith(nextRaw.trim()))
    return before;
  const leadingNewline = /^\s*\n/u.test(nextRaw);
  const leadingPunctuation = /^[.,;:!?]/u.test(nextRaw.trimStart());
  const join = before && !/\s$/u.test(before) && !leadingNewline && !leadingPunctuation ? " " : "";
  let next = nextRaw;
  const index = next.search(/[a-zà-ÿ]/iu);
  if (index >= 0) {
    const first = !before.trim() || /[.!?]$/u.test(before.trimEnd()) ||
      !!options.forceUppercase;
    next = next.slice(0,index) +
      (first ? next[index].toLocaleUpperCase("it-IT") :
        next[index].toLocaleLowerCase("it-IT")) + next.slice(index+1);
  }
  return reviewPunctuation(before + join + next);
}
