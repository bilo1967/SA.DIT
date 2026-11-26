// Standalone feasibility probe: browser-managed microphone via Web Speech API.
// No audio or transcript is sent to the peer or to the room application.
export function initSpeechTest({ button, status, interim, log }) {
  const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let active = false;
  let stopping = false;

  const display = (message) => { status.textContent = message; };
  const reset = () => {
    active = false;
    button.disabled = !Constructor;
    button.textContent = "Avvia riconoscimento (test)";
    interim.textContent = "";
  };

  if (!Constructor) {
    button.disabled = true;
    display("SpeechRecognition non disponibile in questa WebView");
    log("Riconoscimento vocale: API assente.",
      "SpeechRecognition e webkitSpeechRecognition non sono disponibili.");
  } else {
    display("API presente · microfono predefinito · italiano");
    log("Riconoscimento vocale: API rilevata.",
      window.SpeechRecognition ? "SpeechRecognition" : "webkitSpeechRecognition");
  }

  function stop() {
    if (!recognition) return;
    stopping = true;
    const previous = recognition;
    recognition = null;
    try { previous.abort(); } catch (error) {
      log("Riconoscimento vocale: errore durante l'arresto.", error.message, "error");
    }
    reset();
    display("Riconoscimento interrotto");
  }

  function start() {
    if (!Constructor || recognition) return;
    const session = new Constructor();
    session.lang = "it-IT";
    session.continuous = true;
    session.interimResults = true;
    session.maxAlternatives = 1;
    recognition = session;
    stopping = false;
    button.disabled = true;
    display("Avvio del riconoscimento…");

    session.onstart = () => {
      if (recognition !== session) return;
      active = true;
      button.disabled = false;
      button.textContent = "Interrompi riconoscimento";
      display("Microfono attivo · ascolto in corso");
      log("Riconoscimento vocale avviato.", "it-IT, continuous=true, interimResults=true");
    };
    session.onresult = event => {
      if (recognition !== session) return;
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const candidate = result[0];
        if (!candidate) continue;
        if (result.isFinal) {
          log("Trascrizione: " + candidate.transcript.trim(),
            "Confidenza: " + (candidate.confidence ?? "non disponibile"));
        } else {
          partial += (partial ? " " : "") + candidate.transcript.trim();
        }
      }
      interim.textContent = partial;
    };
    session.onerror = event => {
      if (recognition !== session) return;
      const code = event.error || "unknown";
      log("Riconoscimento vocale: errore " + code + ".",
        event.message || "Controllare permessi microfono, runtime WebView2 e servizio online.", "error");
      display("Errore: " + code);
    };
    session.onnomatch = () => {
      if (recognition === session) log("Riconoscimento vocale: nessuna corrispondenza.");
    };
    session.onend = () => {
      if (recognition !== session) return;
      recognition = null;
      reset();
      display(stopping ? "Riconoscimento interrotto" : "Riconoscimento terminato");
      log("Riconoscimento vocale terminato.");
    };
    try {
      // start() is called synchronously from the user's button click.
      session.start();
    } catch (error) {
      recognition = null;
      reset();
      display("Avvio non riuscito");
      log("Riconoscimento vocale: avvio non riuscito.", error.message, "error");
    }
  }

  button.onclick = () => {
    if (recognition) stop();
    else start();
  };
  return { stop, supported: Boolean(Constructor), get active() { return active; } };
}
