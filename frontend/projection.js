// SA.DIT projection: independent window, Wails events for local WebRTC signaling.
import { Events } from "/wails/runtime.js";

const video = document.getElementById("projection");
const placeholder = document.getElementById("placeholder");
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
  message("In attesa dei sottotitoli dell'interprete…");
}

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
