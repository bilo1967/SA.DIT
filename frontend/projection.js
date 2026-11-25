// SA.DIT projection: independent window, Wails events for local WebRTC signaling.
import { Events } from "/wails/runtime.js";

const video = document.getElementById("projection");
const placeholder = document.getElementById("placeholder");
let pc = null;
let activeSession = null;
let earlyCandidates = [];
const emit = (name, data = {}) => Events.Emit("sadit:projection:" + name, data).catch(console.error);

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
  emit("ready", {});
});

Events.On("sadit:projection:stop", () => stop());

Events.On("sadit:projection:offer", async event => {
  const incoming = event.data || {};
  if (!incoming.session || !incoming.sdp) return;
  const stored = earlyCandidates.filter(item => item.session === incoming.session);
  stop();
  activeSession = incoming.session;
  earlyCandidates = stored;
  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    const current = pc;
    pc.onicecandidate = e => {
      if (e.candidate) emit("candidate-to-room", {
        session: activeSession, candidate: e.candidate.toJSON()
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc !== current) return;
      if (current.connectionState === "connected")
        emit("status", { session: activeSession, status: "connected" });
      if (current.connectionState === "failed" || current.connectionState === "disconnected") {
        message("Collegamento video locale interrotto.");
        emit("status", { session: activeSession, status: current.connectionState });
      }
    };
    pc.ontrack = e => {
      if (e.track.kind !== "video") return;
      video.srcObject = e.streams[0] || new MediaStream([e.track]);
      video.style.display = "block";
      placeholder.style.display = "none";
      video.play().catch(err => {
        message("Impossibile riprodurre il video ricevuto.");
        emit("error", { session: activeSession, message: err.message });
      });
      emit("status", { session: activeSession, status: "track" });
    };
    await pc.setRemoteDescription(incoming.sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    await emit("answer", { session: activeSession, sdp: pc.localDescription });
    for (const item of earlyCandidates) await pc.addIceCandidate(item.candidate);
    earlyCandidates = [];
  } catch (err) {
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
window.addEventListener("beforeunload", stop);
