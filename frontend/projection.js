// SA.DIT projection: independent window, Wails events for local WebRTC signaling.
import { Call, Events } from "/wails/runtime.js";
import { initProjectionCrop } from "./projection-crop.js";

const video = document.getElementById("projection");
const placeholder = document.getElementById("placeholder");
const textProjection = document.getElementById("textProjection");
const finalTranscript = document.getElementById("finalTranscript");
const interimTranscript = document.getElementById("interimTranscript");
let displayMode = "external";
let lastTextRevision = -1;
let subtitleFontSize = 36;
let lightTheme = false;
const themeButton = document.getElementById("themeToggle");
themeButton.onclick = () => {
  lightTheme = !lightTheme;
  document.documentElement.classList.toggle("theme-light", lightTheme);
  themeButton.textContent = lightTheme ? "Bianco su nero" : "Nero su bianco";
};
function resizeSubtitle(delta) {
  subtitleFontSize = Math.min(96,Math.max(16,subtitleFontSize + delta));
  textProjection.style.setProperty("--subtitle-size",subtitleFontSize+"px");
}
document.getElementById("fontDecrease").onclick = () => resizeSubtitle(-4);
document.getElementById("fontIncrease").onclick = () => resizeSubtitle(4);
const projectionCrop = initProjectionCrop(video);
// A frameless projection exposes a hover-only native drag handle.
Call.ByName("main.ProjectionService.IsTitlebarHidden")
  .then(hidden => document.documentElement.classList.toggle("frameless", hidden))
  .catch(console.error);
let pc = null;
let activeSession = null;
let earlyCandidates = [];
const emit = (name, data = {}) => Events.Emit("sadit:projection:" + name, data).catch(console.error);
const debug = (message, details = "") => emit("debug", {message, details});

function message(text) {
  placeholder.textContent = text;
  placeholder.style.display = "flex";
}

function stop() {
  if (pc) {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }
  pc = null;
  activeSession = null;
  earlyCandidates = [];
  video.pause();
  video.srcObject = null;
  video.style.display = "none";
  projectionCrop.reset();
  displayMode = "external";
  lastTextRevision = -1;
  textProjection.style.display = "none";
  finalTranscript.textContent = "";
  interimTranscript.textContent = "";
  document.documentElement.classList.remove("text-mode");
  message("In attesa dei sottotitoli dell'interprete…");
}

// In text mode no WebRTC stream is created; snapshots arrive through Wails events.
Events.On("sadit:projection:text-mode", event => {
  const payload = event.data || {};
  if (payload.mode !== "integrated") return;
  if (displayMode !== "integrated") {
    displayMode = "integrated";
    lastTextRevision = -1;
    finalTranscript.textContent = "";
    interimTranscript.textContent = "";
  }
  video.style.display = "none";
  placeholder.style.display = "none";
  textProjection.style.display = "block";
  document.documentElement.classList.add("text-mode");

});
Events.On("sadit:projection:transcript", event => {
  const payload = event.data || {};
  if (displayMode !== "integrated" || !Number.isSafeInteger(payload.revision) ||
      payload.revision <= lastTextRevision) return;
  lastTextRevision = payload.revision;
  finalTranscript.textContent = String(payload.final || "");
  // Provisional recognition is deliberately never projected.
  interimTranscript.textContent = "";
  textProjection.scrollTop = textProjection.scrollHeight;
});

Events.On("sadit:projection:probe", () => {
  debug("Richiesta PROBE ricevuta: finestra pronta.");
  emit("ready", {});
});

Events.On("sadit:projection:stop", () => stop());

Events.On("sadit:projection:offer", async event => {
  const incoming = event.data || {};
  if (!incoming.session || !incoming.sdp) {
    debug("Offerta video non valida: mancano sessione o SDP.");
    return;
  }
  debug("Offerta video locale ricevuta.", "Sessione: " + incoming.session + " · SDP: " + (incoming.sdp.sdp?.length || 0));
  const stored = earlyCandidates.filter(item => item.session === incoming.session);
  stop();
  activeSession = incoming.session;
  earlyCandidates = stored;
  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    debug("Creato RTCPeerConnection della proiezione.");
    const current = pc;
    pc.onicecandidate = e => {
      if (e.candidate) emit("candidate-to-room", {
        session: activeSession, candidate: e.candidate.toJSON()
      });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc === current) debug("ICE locale: " + current.iceConnectionState);
    };
    pc.onconnectionstatechange = () => {
      if (pc !== current) return;
      debug("Connessione video locale: " + current.connectionState);
      if (current.connectionState === "connected")
        emit("status", { session: activeSession, status: "connected" });
      if (current.connectionState === "failed" || current.connectionState === "disconnected") {
        message("Collegamento video locale interrotto.");
        emit("status", { session: activeSession, status: current.connectionState });
      }
    };
    pc.ontrack = e => {
      if (e.track.kind !== "video") return;
      debug("Traccia video arrivata.", "Stato: " + e.track.readyState + " · Muted: " + e.track.muted);
      video.srcObject = e.streams[0] || new MediaStream([e.track]);
      video.style.display = "block";
      placeholder.style.display = "none";
      video.onloadedmetadata = () => debug("Metadati video disponibili.", video.videoWidth + " × " + video.videoHeight);
      video.onplaying = () => debug("La finestra sta riproducendo il video.", video.videoWidth + " × " + video.videoHeight);
      video.play().catch(err => {
        message("Impossibile riprodurre il video ricevuto.");
        emit("error", { session: activeSession, message: err.message });
      });
      emit("status", { session: activeSession, status: "track" });
    };
    await pc.setRemoteDescription(incoming.sdp);
    debug("SDP remoto applicato.");
    await pc.setLocalDescription(await pc.createAnswer());
    debug("Risposta SDP locale creata.");
    await emit("answer", { session: activeSession, sdp: pc.localDescription });
    debug("Risposta SDP inviata alla finestra principale.");
    for (const item of earlyCandidates) await pc.addIceCandidate(item.candidate);
    earlyCandidates = [];
  } catch (err) {
    debug("Errore durante la negoziazione locale.", err.message);
    message("La finestra non riesce ad avviare la proiezione.");
    emit("error", { session: activeSession, message: err.message });
  }
});

Events.On("sadit:projection:candidate-to-projection", async event => {
  const incoming = event.data || {};
  if (!incoming.session || !incoming.candidate) return;
  if (activeSession && incoming.session !== activeSession) return;
  if (!pc?.remoteDescription) {
    earlyCandidates.push(incoming);
    return;
  }
  try {
    await pc.addIceCandidate(incoming.candidate);
  } catch (err) {
    emit("error", { session: activeSession, message: "ICE: " + err.message });
  }
});

// Register listeners before announcing readiness.
emit("ready", {});
debug("Pagina di proiezione caricata; listener registrati.");
window.addEventListener("beforeunload", stop);
