// Interpreter Web Speech recognizer: persistent state, DIT.tafono keywords and
// bounded restart after unexpected onend (including recoverable network errors).
import { cleanEdgeSegment, applyVoiceCommands, appendReviewedSegment, isPunctuationOnly, stripEdgePunctuationAfterCommand, containsSpokenPunctuationCommand } from "./voice-format.js";

export function initSpeechTest({button, status = {textContent:""}, interim = {textContent:""}, log, getCommands = () => [], onTranscript = () => {}, onInterim = () => {}}) {
  const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let desired = false;
  let fatal = false;
  let finalText = "";
  let partialText = "";
  let revision = 0;
  let lastFailure = "";

  const display = text => { status.textContent = text; };
  // Only committed, post-processed text leaves the Interpreter.
  const emit = () => onTranscript({type: "transcript", revision: ++revision, final: finalText});
  const showButtons = () => {
    button.disabled = !Constructor;
    button.textContent = desired ? "Interrompi riconoscimento" : "Avvia riconoscimento";
  };
  if (!Constructor) {
    display("SpeechRecognition non disponibile in questa WebView");
    log("Riconoscimento vocale: API assente.", "", "error");
  } else display("Pronto · microfono predefinito · italiano");
  showButtons();

  function clear() {
    finalText = "";
    partialText = "";
    revision = 0;
    interim.textContent = "";
    onInterim("");
    emit();
  }
  function stop() {
    desired = false;
    fatal = false;
    const old = recognition;
    recognition = null;
    if (old) {
      try { old.abort(); } catch (error) {
        log("Riconoscimento vocale: errore durante l'arresto.", error.message, "error");
      }
    }
    partialText = "";
    interim.textContent = "";
    onInterim("");
    showButtons();
    display("Riconoscimento interrotto");
  }

  function launch() {
    if (!desired || !Constructor || recognition) return;
    const session = new Constructor();
    session.lang = "it-IT";
    session.continuous = true;
    session.interimResults = true;
    session.maxAlternatives = 1;
    recognition = session;
    display("Avvio del riconoscimento…");

    session.onstart = () => {
      if (recognition !== session) return;
      display("Microfono attivo · ascolto in corso");
      if (lastFailure) {
        log("Riconoscimento vocale ripristinato.", "", "diagnostic");
        lastFailure = "";
      } else log("Riconoscimento vocale avviato.", "", "diagnostic");
    };
    session.onaudiostart = () => {
      if (recognition === session) log("Riconoscimento vocale: microfono acquisito.", "", "diagnostic");
    };
    session.onresult = event => {
      if (recognition !== session) return;
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const raw = result[0]?.transcript;
        if (typeof raw !== "string") continue;
        if (result.isFinal) {
          const commands = getCommands();
          const cleaned = cleanEdgeSegment(stripEdgePunctuationAfterCommand(raw, commands));
          if (!cleaned) continue;
          const processed = applyVoiceCommands(cleaned, commands);
          // Reject orphan punctuation, not punctuation expressly requested
          // by the interpreter. The latter can close a previous segment.
          if (isPunctuationOnly(processed) &&
              !containsSpokenPunctuationCommand(cleaned, commands)) continue;
          const previous = finalText;
          const forceUppercase = commands.some(({t,r}) =>
            r === "#M" && cleaned.toLocaleLowerCase("it-IT").startsWith(t.toLocaleLowerCase("it-IT")));
          finalText = appendReviewedSegment(previous, processed, {forceUppercase});
          if (finalText !== previous) {
            if (processed.trim()) log("Trascrizione: " + finalText.slice(previous.length).trimStart(), "", "transcript");
            emit();
          }
        } else {
          partial += (partial ? " " : "") + raw.trim();
        }
      }
      partialText = partial;
      interim.textContent = partial;
      onInterim(partial);
    };
    session.onerror = event => {
      if (recognition !== session) return;
      const type = event.error || "unknown";
      const recoverable = ["network", "no-speech", "aborted"].includes(type);
      lastFailure = type;
      if (recoverable) {
        log("Riconoscimento vocale: interruzione " + type + ".", event.message || "", "diagnostic");
      } else {
        log("Riconoscimento vocale: errore " + type + ".", event.message || "", "error");
      }
      if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(type)) {
        fatal = true;
        desired = false;
        showButtons();
      }
      display(recoverable ? "Riconnessione automatica…" : "Errore: " + type);
    };
    session.onend = () => {
      if (recognition !== session) return;
      recognition = null;
      partialText = "";
      interim.textContent = "";
      onInterim("");
      // Same behavior as DIT.tafono: restart immediately when recognition ends.
      if (desired && !fatal) launch();
      else if (!fatal) display("Riconoscimento terminato");
    };
    try {
      // WebView2 microphone selection via start(audioTrack) was not reliable in testing.
      session.start();
    } catch (error) {
      recognition = null;
      lastFailure = "start";
      // A synchronous start failure cannot be fixed by a tight retry loop.
      desired = false;
      fatal = true;
      showButtons();
      display("Impossibile riattivare il riconoscimento");
      log("Riconoscimento vocale: riattivazione non riuscita.", error.message, "error");
    }
  }

  function start() {
    if (!Constructor || desired) return;
    desired = true;
    fatal = false;
    showButtons();
    launch();
  }
  button.onclick = () => desired ? stop() : start();
  return {stop, clear, start, supported: !!Constructor, get active() { return desired; }, snapshot: () => ({final:finalText,revision})};
}
