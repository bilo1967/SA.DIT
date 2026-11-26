// Interpreter Web Speech recognizer: persistent state, DIT.tafono keywords and
// bounded restart after unexpected onend (including recoverable network errors).
import { applyVoiceCommands } from "./voice-format.js";

export function initSpeechTest({button, status = {textContent:""}, interim = {textContent:""}, log, getCommands = () => [], getMicrophoneId = () => "", onTranscript = () => {}, onInterim = () => {}}) {
  const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let desired = false;
  let pendingRestart = null;
  let failures = 0;
  let fatal = false;
  let finalText = "";
  let partialText = "";
  let revision = 0;
  let microphoneStream = null;
  let starting = false;
  let lastFailure = "";

  const display = text => { status.textContent = text; };
  const emit = () => onTranscript({type: "transcript", revision: ++revision, final: finalText, interim: partialText});
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
    if (pendingRestart !== null) clearTimeout(pendingRestart);
    pendingRestart = null;
    starting = false;
    microphoneStream?.getTracks().forEach(track=>track.stop());
    microphoneStream = null;
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

  function scheduleRestart() {
    if (!desired || fatal || pendingRestart !== null) return;
    const delay = Math.min(15000, 500 * Math.pow(2, Math.min(failures++, 5)));
    display("Riconnessione tra " + (delay / 1000).toFixed(1) + " s");
    log("Riconoscimento vocale: riavvio automatico.", "Attesa " + delay + " ms", "diagnostic");
    pendingRestart = setTimeout(() => {
      pendingRestart = null;
      if (desired && !fatal) launch();
    }, delay);
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
      } else log("Riconoscimento vocale avviato.");
    };
    session.onaudiostart = () => {
      if (recognition === session) log("Riconoscimento vocale: microfono acquisito.");
    };
    session.onresult = event => {
      if (recognition !== session) return;
      failures = 0;
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const raw = result[0]?.transcript;
        if (typeof raw !== "string") continue;
        if (result.isFinal) {
          const processed = applyVoiceCommands(raw, getCommands());
          finalText += processed;
          if (processed.trim()) log("Trascrizione: " + processed, "", "transcript");
        } else {
          partial += (partial ? " " : "") + raw.trim();
        }
      }
      partialText = partial;
      interim.textContent = partial;
      onInterim(partial);
      emit();
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
      emit();
      if (desired && !fatal) scheduleRestart();
      else if (!fatal) display("Riconoscimento terminato");
    };
    try {
      const track = microphoneStream?.getAudioTracks()[0];
      if (track && track.readyState !== "live") throw new Error("Il microfono selezionato non è disponibile.");
      if (track) session.start(track);
      else session.start();
    } catch (error) {
      recognition = null;
      lastFailure = "start";
      log("Riconoscimento vocale: avvio non riuscito.", error.message, "diagnostic");
      scheduleRestart();
    }
  }

  async function start() {
    if (!Constructor || desired || starting) return;
    desired = true;
    starting = true;
    fatal = false;
    failures = 0;
    showButtons();
    try {
      const microphoneId = getMicrophoneId();
      if (microphoneId) {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio:{deviceId:{exact:microphoneId}},video:false,
        });
      }
      if (desired) launch();
      else {
        microphoneStream?.getTracks().forEach(track=>track.stop());
        microphoneStream = null;
      }
    } catch (error) {
      desired = false;
      display("Impossibile selezionare il microfono");
      log("Riconoscimento vocale: impossibile aprire il microfono selezionato.",error.message,"error");
      showButtons();
    } finally { starting = false; }
  }
  button.onclick = () => desired ? stop() : start();
  return {stop, clear, start, supported: !!Constructor, get active() { return desired; }, snapshot: () => ({final:finalText,interim:partialText,revision})};
}
