// SA.DIT - one desktop app, two roles, compact interface, PeerJS and local projection.
import { Call, Events } from "/wails/runtime.js";
import { initSettings } from "./settings.js";

const $ = id => document.getElementById(id);
let role = null;
let signaling = null, preferences = {};
let savePrefs = async () => {};
let peer = null, data = null, media = null;
let localStream = null, remoteStream = null;
let busy = false;
let switchingSharing = false;
let projectionPC = null;
let pendingProjectionICE = [];
let projectionHandshakeTimer = null;
let projectionConnected = false;
let projectionSession = null;
let videoStatsTimer = null;
let projectionProbeCount = 0;
let reserveVideoTimer = null;
const projectionEmit = (name, payload={}) => Events.Emit("sadit:projection:" + name, payload)
  .catch(error => log("Errore di comunicazione con la proiezione.", error.message, "error"));

function log(message, technical = "", level = "info") {
  const item = document.createElement("div");
  item.className = "log-entry " + level;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = new Date().toLocaleTimeString();
  const caption = document.createElement("span");
  caption.className = "message";
  caption.textContent = message;
  item.append(time, caption);
  if (technical) {
    const details = document.createElement("div");
    details.className = "detail";
    details.textContent = technical;
    item.append(details);
  }
  $("log").append(item);
  $("log").scrollTop = $("log").scrollHeight;
}
function failure(description, error) {
  log(description, error?.message || String(error || ""), "error");
  setStatus(description, "error");
}
function setStatus(label, kind = "") {
  $("connLabel").textContent = label;
  $("statusText").textContent = label;
  $("connDot").className = "dot " + kind;
}
function connectionActive(yes) {
  $("changeSharing").classList.toggle("hidden", !(yes && role === "interpreter"));
  $("stopSharing").classList.toggle("hidden", !(yes && role === "interpreter"));
  $("pinInput").disabled = yes;
  $("chatText").disabled = !yes;
  $("sendChat").disabled = !yes;
  $("chatPresence").textContent = yes ? "Connessa" : "Non connessa";
  // The room must be able to change its microphone during a session.
  $("deviceSelect").disabled = false;
}
function newRole(next) {
  disconnect(false);
  role = next;
  $("roleScreen").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  $("changeRole").classList.remove("hidden");
  $("roleTitle").textContent = role === "interpreter" ? "Interprete · Respeaker" : "Sala · Proiezione";
  $("controlTitle").textContent = role === "interpreter" ? "Trasmissione sottotitoli" : "Ricezione sottotitoli";
  $("interpreterControls").classList.toggle("hidden", role !== "interpreter");
  $("roomControls").classList.toggle("hidden", role !== "room");
  $("deviceLabel").textContent = role === "interpreter" ? "Dispositivo di ascolto" : "Ingresso audio della sala";
  $("deviceIcon").innerHTML = role === "interpreter"
    ? '<svg viewBox="0 0 24 24"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="13" width="4" height="8" rx="2"/><rect x="17" y="13" width="4" height="8" rx="2"/></svg>'
    : '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M7 21h10"/></svg>';
  $("deviceSelect").replaceChildren(new Option("Predefinito", ""));
  $("videoDiagnostic").classList.toggle("hidden", role !== "room");
  if (role === "room") $("videoDiagnosticStatus").textContent = "In attesa di connessione";
  refreshDevices(true);
  setStatus("Non connesso");
  log(role === "interpreter" ? "Modalità Interprete pronta." : "Modalità Sala pronta.");
  savePrefs({role: next}).catch(e => log("Non riesco a memorizzare il ruolo.", e.message, "error"));
}
function peerOptions() {
  return {
    host: signaling.host,
    port: signaling.port,
    path: signaling.path,
    secure: signaling.secure,
    debug: 1,
    config: { iceServers: signaling.iceServers || [] },
  };
}
function peerFailure(error, originPeer) {
  if (peer !== originPeer) return;
  const type = String(error?.type || "");
  if (type === "peer-unavailable" || type === "network" || type === "server-error" || type === "socket-error") {
    const reason = type === "peer-unavailable"
      ? "PIN non valido oppure Interprete non raggiungibile. Controlla il PIN e riprova."
      : "Il server PeerJS non è raggiungibile. Controlla la rete e riprova.";
    disconnect(false);
    failure(reason, error);
  } else failure("Errore del collegamento PeerJS.", error);
}
function makePeer(id) {
  if (!window.Peer) throw new Error("La libreria PeerJS non è disponibile. Verifica la connessione Internet.");
  const p = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
  p.on("error", e => peerFailure(e, p));
  p.on("disconnected", () => { if (peer === p) setStatus("Signaling disconnesso", "waiting"); });
  p.on("close", () => { if (peer === p) setStatus("Connessione terminata"); });
  return p;
}
function addMessage(text, mine = false) {
  const empty = $("messages").querySelector(".empty-chat");
  if (empty) empty.remove();
  const bubble = document.createElement("div");
  bubble.className = "bubble" + (mine ? " mine" : "");
  const content = document.createElement("div");
  content.textContent = text;
  const time = document.createElement("small");
  time.textContent = (mine ? "Tu" : "Controparte") + " · " + new Date().toLocaleTimeString();
  bubble.append(content, time);
  $("messages").append(bubble);
  $("messages").scrollTop = $("messages").scrollHeight;
}
function attachData(connection) {
  if (data && data !== connection) { connection.close(); return; }
  data = connection;
  data.on("open", () => {
    if (data !== connection) return;
    connectionActive(true);
    setStatus("Collegato alla controparte", "connected");
    log("Canale chat e segnalazione attivo.");
  });
  data.on("data", payload => {
    if (payload && payload.type === "chat" && typeof payload.text === "string") addMessage(payload.text.slice(0, 2000));
  });
  data.on("close", () => {
    // Clear the old data connection as well: otherwise the interpreter rejects
    // the next connection and the new chat is permanently disabled.
    if (data !== connection) return;
    log("La controparte si è scollegata. Sessione pronta per un nuovo collegamento.");
    disconnect(false);
  });
  data.on("error", error => { if (data === connection) failure("La chat non è disponibile.", error); });
}
async function chooseAudioSink(deviceId) {
  const audio = $("incomingAudio");
  if (!audio) return;
  if (typeof audio.setSinkId === "function") {
    try { await audio.setSinkId(deviceId); } catch (e) { failure("Non riesco a selezionare l'uscita audio.", e); }
  } else if (deviceId) log("WebView2 non permette di scegliere le cuffie: uso l'uscita predefinita.");
}
async function refreshDevices(requestPermission = false) {
  const select = $("deviceSelect");
  const selected = select.value || (role === "room" ? preferences.inputDeviceId : preferences.outputDeviceId) || "";
  select.replaceChildren(new Option("Predefinito", ""));
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    const kind = role === "room" ? "audioinput" : "audiooutput";
    // WebView2 can hide audio inputs until the user authorizes microphone access.
    if (role === "room" && requestPermission && devices.filter(d=>d.kind==="audioinput").length <= 1 && !localStream) {
      try {
        const temporary = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        devices = await navigator.mediaDevices.enumerateDevices();
        temporary.getTracks().forEach(track=>track.stop());
      } catch(e) { log("Microfono non autorizzato. Verifica i permessi di Windows.",e.message,"error"); }
    }
    for (const d of devices.filter(x => x.kind === kind && x.deviceId && x.deviceId !== "default")) {
      select.add(new Option(d.label || (kind === "audioinput" ? "Ingresso " : "Uscita ") + select.length, d.deviceId));
    }
    if ([...select.options].some(x => x.value === selected)) select.value = selected;
  } catch (e) {
    log("Impossibile elencare i dispositivi audio.", e.message, "error");
  }
}
async function selectedAudio() {
  const deviceId = $("deviceSelect").value;
  const stream = await navigator.mediaDevices.getUserMedia({audio: deviceId ? { deviceId:{exact:deviceId} } : true, video:false});
  log("Audio della sala acquisito.", stream.getAudioTracks()[0]?.label || "Dispositivo predefinito");
  refreshDevices(false);
  return stream;
}
function stopTracks() {
  localStream?.getTracks().forEach(t => t.stop());
  localStream = null;
}
function closeNetwork() {
  // Detach references before closing the connections: close() can invoke event
  // handlers synchronously, and old callbacks must not reset a new session.
  const oldMedia = media;
  const oldData = data;
  const oldPeer = peer;
  media = null;
  data = null;
  peer = null;
  try { oldMedia?.close(); } catch {}
  try { oldData?.close(); } catch {}
  try { oldPeer?.destroy(); } catch {}
}
function disconnect(writeLog = true) {
  // Stop capture even when the other side disappears unexpectedly.
  closeNetwork();
  if (reserveVideoTimer) clearInterval(reserveVideoTimer);
  reserveVideoTimer = null;
  stopTracks();
  remoteStream = null;
  const preview = $("remoteVideoPreview");
  preview.pause();
  preview.srcObject = null;
  $("videoDiagnosticStatus").textContent = "Nessun video";
  clearInterval(videoStatsTimer);
  videoStatsTimer = null;
  busy = false;
  projectionEmit("stop");
  try { projectionPC?.close(); } catch {}
  projectionPC = null;
  pendingProjectionICE = [];
  projectionConnected = false;
  projectionSession = null;
  clearTimeout(projectionHandshakeTimer);
  projectionHandshakeTimer = null;
  projectionProbeCount = 0;
  connectionActive(false);
  $("startInterpreter").disabled = false;
  $("joinRoom").disabled = false;
  $("startInterpreter").textContent = "Condividi finestra e ottieni PIN";
  $("joinRoom").textContent = "Connettiti";
  $("startInterpreter").classList.remove("is-connected");
  $("joinRoom").classList.remove("is-connected");
  $("changeSharing").classList.add("hidden");
  $("stopSharing").classList.add("hidden");
  $("pinInput").disabled = false;
  $("pinDisplay").textContent = "—";
  $("videoDiagnostic").classList.toggle("hidden", role !== "room");
  $("copyPIN").disabled = true;
  $("incomingAudio").srcObject = null;
  if (writeLog) log("Sessione terminata.");
  setStatus("Non connesso");
}
async function startInterpreter() {
  if (busy) return;
  busy = true;
  $("startInterpreter").disabled = true;
  setStatus("Seleziona la finestra da trasmettere", "waiting");
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false});
    log("Finestra selezionata: cattura video attivata.",
      localStream.getVideoTracks().map(t => t.label + " · " + t.readyState + " · " + JSON.stringify(t.getSettings())).join("; "));
    localStream.getVideoTracks()[0]?.addEventListener("ended", () => { if(!switchingSharing) stopSharing(); });
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
    peer = makePeer("sadit-" + pin);
    peer.on("connection", incoming => {
      // One room PC per interpreter session.
      if (data) { incoming.close(); return; }
      attachData(incoming);
      setStatus("La sala sta effettuando la connessione", "waiting");
    });
    peer.on("call", incomingCall => {
      log("Chiamata multimediale in arrivo dalla Sala.", "Peer: " + incomingCall.peer);
      if (media) { log("Chiamata duplicata rifiutata."); incomingCall.close(); return; }
      media = incomingCall;
      incomingCall.answer(localStream);
      log("Risposta alla chiamata inviata con video.",
        "Tracce video: " + localStream.getVideoTracks().length + " · " +
        localStream.getVideoTracks().map(t => t.readyState + ":" + t.label).join(", "));
      observeMediaConnection(incomingCall, "Interprete");
      incomingCall.on("stream", stream => {
        log("Interprete: flusso audio remoto ricevuto.", "Tracce audio: " + stream.getAudioTracks().length);
        $("incomingAudio").srcObject = stream;
        chooseAudioSink($("deviceSelect").value);
        $("incomingAudio").play().catch(e => log("Premi sulla finestra per autorizzare l'ascolto.", e.message));
        log("Audio della sala ricevuto.");
      });
      incomingCall.on("error", e => {
        if (media !== incomingCall) return;
        disconnect(false);
        failure("Il collegamento audio con la Sala si è interrotto.", e);
      });
      incomingCall.on("close", () => {
        if (media !== incomingCall) return;
        disconnect(false);
        log("La Sala si è scollegata: acquisizione video e audio interrotti.");
      });
    });
    peer.on("open", () => {
      log("Interprete registrato su PeerJS, pronto a ricevere chiamate.");
      $("startInterpreter").disabled = false;
      $("startInterpreter").textContent = "Disconnettiti";
      $("startInterpreter").classList.add("is-connected");
      $("pinDisplay").textContent = pin;
      $("copyPIN").disabled = false;
      setStatus("PIN pronto · in attesa della sala", "waiting");
      log("PIN creato. Comunicalo alla sala.");
    });
  } catch (e) {
    disconnect(false);
    failure("Non riesco ad avviare la condivisione della finestra.", e);
  }
}
// Reserve a video m-line in the Room's PeerJS offer. Without it, an
// audio-only offer cannot negotiate the interpreter's video in the answer.
// This tiny silent synthetic video is never shown or sent to the interpreter UI.
function reserveIncomingVideoChannel(stream) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  let frame = 0;
  const paint = () => {
    ctx.fillStyle = frame++ % 2 ? "#151d27" : "#16202a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  paint();
  const reserve = canvas.captureStream(1);
  const videoTrack = reserve.getVideoTracks()[0];
  if (!videoTrack) throw new Error("Impossibile creare il canale video WebRTC della Sala.");
  stream.addTrack(videoTrack);
  reserveVideoTimer = setInterval(paint, 1000);
  log("Sala: canale video riservato nell'offerta WebRTC.",
    "Audio: " + stream.getAudioTracks().length + " · Video sintetico: " +
    stream.getVideoTracks().length + " · " + videoTrack.readyState);
}

async function joinRoom() {
  if (busy) return;
  const pin = $("pinInput").value.trim();
  if (!/^\d{6}$/.test(pin)) { failure("Inserisci il PIN di sei cifre dell'interprete."); return; }
  busy = true;
  $("joinRoom").disabled = true;
  setStatus("Collegamento con l'interprete", "waiting");
  try {
    localStream = await selectedAudio();
    reserveIncomingVideoChannel(localStream);
    peer = makePeer();
    peer.on("open", () => {
      $("joinRoom").disabled = false;
      $("joinRoom").textContent = "Disconnettiti";
      $("joinRoom").classList.add("is-connected");
      const id = "sadit-" + pin;
      log("Sala: richiesta connessione dati a PeerJS.", "Peer remoto: " + id);
      const connection = peer.connect(id, {reliable:true});
      attachData(connection);
      connection.on("open", () => {
        log("Sala: invio offerta audio/video all'Interprete.",
          "Tracce audio: " + localStream.getAudioTracks().length +
          " · Tracce video: " + localStream.getVideoTracks().length);
        media = peer.call(id, localStream);
        if (!media) { failure("Non riesco a iniziare lo scambio multimediale."); return; }
        observeMediaConnection(media, "Sala");
        $("videoDiagnosticStatus").textContent = "Chiamata inviata, attesa video";
        media.on("stream", stream => {
          if (media === null) return;
          remoteStream = stream;
          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();
          log("WebRTC: flusso remoto ricevuto.", "Video: " + videoTracks.length + " · Audio: " + audioTracks.length);
          $("videoDiagnostic").classList.remove("hidden");
          const preview = $("remoteVideoPreview");
          preview.srcObject = stream;
          $("videoDiagnosticStatus").textContent = videoTracks.length ? "Traccia presente" : "Nessuna traccia video";
          preview.play().then(() => log("Anteprima locale avviata.")).catch(e => failure("Anteprima video non avviata.", e));
          preview.onloadedmetadata = () => log("Anteprima: metadati video ricevuti.",
            preview.videoWidth + " × " + preview.videoHeight);
          preview.onplaying = () => {
            $("videoDiagnosticStatus").textContent = "Riproduzione attiva";
            log("Anteprima: riproduzione video attiva.", preview.videoWidth + " × " + preview.videoHeight);
          };
          for (const track of videoTracks) {
            log("Traccia video remota.", "ID: " + track.id + " · Stato: " + track.readyState + " · Muted: " + track.muted);
            track.onunmute = () => log("Traccia video: arrivano dati.");
            track.onmute = () => log("Traccia video: dati sospesi.");
            track.onended = () => log("Traccia video: terminata.");
          }
          clearInterval(videoStatsTimer);
          videoStatsTimer = setInterval(() => reportVideoStats(), 5000);
          startProjection().catch(e => failure("Non riesco ad aprire la proiezione.", e));
        });
        media.on("error", e => failure("Non riesco a ricevere il video dell'interprete.", e));
        const currentMedia = media;
        currentMedia.on("close", () => {
          if (media !== currentMedia) return;
          disconnect(false);
          log("L'Interprete ha interrotto la connessione. Audio e proiezione chiusi.");
        });
      });
    });
  } catch (e) {
    disconnect(false);
    failure("Non riesco a connettere la sala.", e);
  }
}
async function startProjection() {
  // A projection window can be closed and opened again during a session.
  // A new local handshake must be permitted even if an older one succeeded.
  if (remoteStream) {
    clearTimeout(projectionHandshakeTimer);
    try { projectionPC?.close(); } catch {}
    projectionPC = null;
    projectionSession = null;
    projectionConnected = false;
    pendingProjectionICE = [];
  }
  await Call.ByName("main.ProjectionService.Open");
  if (remoteStream) probeProjection();
}
function probeProjection() {
  if (!remoteStream || projectionConnected) return;
  projectionProbeCount++;
  if (projectionProbeCount === 1 || projectionProbeCount % 5 === 0)
    log("Proiezione: attendo risposta dalla seconda finestra.", "Tentativo " + projectionProbeCount);
  projectionEmit("probe");
  clearTimeout(projectionHandshakeTimer);
  projectionHandshakeTimer = setTimeout(probeProjection, 800);
}

// Inspect both ends, even if PeerJS never emits a remote 'stream' event.
function observeMediaConnection(call, side) {
  log(side + ": chiamata PeerJS creata.", "peer=" + call.peer + " · open=" + call.open);
  let checks = 0;
  let inspectedSDP = false;
  const timer = setInterval(async () => {
    if (media !== call || checks++ >= 8) { clearInterval(timer); return; }
    const pc = call.peerConnection;
    if (!pc) {
      log(side + ": RTCPeerConnection non ancora disponibile.", "Controllo " + checks);
      return;
    }
    if (!inspectedSDP && pc.localDescription) {
      inspectedSDP = true;
      const localSDP = pc.localDescription.sdp || "";
      const remoteSDP = pc.remoteDescription?.sdp || "";
      const summary = sdp => (["audio", "video"].map(kind => {
        const block = sdp.split(/(?=^m=)/m).find(section => section.startsWith("m=" + kind + " "));
        if (!block) return kind + ": assente";
        const direction = block.match(/^a=(sendrecv|sendonly|recvonly|inactive)$/m)?.[1] || "non specificata";
        return kind + ": " + direction;
      }).join(", "));
      log(side + ": sezioni SDP negoziate.",
        "Locale: [" + summary(localSDP) + "] · Remoto: [" + summary(remoteSDP) + "]");
    }
    const incoming = pc.getReceivers().map(r => r.track.kind + ":" + r.track.readyState + ":muted=" + r.track.muted);
    const outgoing = pc.getSenders().map(s => s.track ? s.track.kind + ":" + s.track.readyState : "nessuna traccia");
    log(side + ": diagnostica della chiamata.", 
      "ICE=" + pc.iceConnectionState + " · Connessione=" + pc.connectionState +
      " · Signaling=" + pc.signalingState +
      " · RX=[" + incoming.join(", ") + "]" +
      " · TX=[" + outgoing.join(", ") + "]");
    if (side === "Sala" && !remoteStream && pc.getReceivers().some(r => r.track.kind === "video")) {
      $("videoDiagnosticStatus").textContent = "Traccia video rilevata, attesa dati";
    }
  }, 2500);
  call.on("error", error => {
    if (media === call) log(side + ": errore chiamata multimediale.", error.message, "error");
    clearInterval(timer);
  });
  call.on("close", () => clearInterval(timer));
}

// Periodic diagnostics: bytes and decoded frames from the remote PeerJS call.
async function reportVideoStats() {
  if (role !== "room" || !media?.peerConnection) return;
  try {
    const stats = await media.peerConnection.getStats();
    const video = [...stats.values()].filter(s => s.type === "inbound-rtp" && (s.kind === "video" || s.mediaType === "video"));
    if (!video.length) {
      log("Diagnostica video: nessuna statistica RTP video.", "Canale multimediale: " + media.peerConnection.connectionState);
      return;
    }
    const s = video[0];
    log("Diagnostica video remoto.", "Byte: " + (s.bytesReceived ?? "?") +
      " · Frame decodificati: " + (s.framesDecoded ?? "?") +
      " · Frame ricevuti: " + (s.framesReceived ?? "?") +
      " · Risoluzione: " + ($("remoteVideoPreview").videoWidth || 0) + "×" + ($("remoteVideoPreview").videoHeight || 0));
  } catch(e) { log("Non riesco a leggere le statistiche video.", e.message, "error"); }
}

function sendChat(event) {
  event.preventDefault();
  const text = $("chatText").value.trim();
  if (!text || !data?.open) return;
  data.send({type:"chat",text});
  addMessage(text, true);
  $("chatText").value = "";
}
// Relay the received video to an independent Wails window using local WebRTC.
// Only signaling goes through the Wails event bus; frames stay on WebRTC.
function sendProjectionOffer() {
  if (!remoteStream || role !== "room" || projectionConnected) return;
  log("Proiezione: seconda finestra pronta, preparo collegamento video locale.");
  const tracks = remoteStream.getVideoTracks().filter(track => track.readyState === "live");
  if (!tracks.length) {
    failure("L'interprete è collegato ma non sta inviando un video.");
    return;
  }
  clearTimeout(projectionHandshakeTimer);
  projectionHandshakeTimer = null;
  projectionConnected = true;
  try { projectionPC?.close(); } catch {}
  pendingProjectionICE = [];
  projectionSession = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  log("Proiezione: nuovo collegamento WebRTC locale.", projectionSession);
  const session = projectionSession;
  const pc = new RTCPeerConnection({iceServers:[]});
  projectionPC = pc;
  for (const track of tracks) pc.addTrack(track, remoteStream);
  pc.oniceconnectionstatechange = () => {
    if (projectionPC === pc) log("Proiezione: ICE locale " + pc.iceConnectionState);
  };
  pc.onsignalingstatechange = () => {
    if (projectionPC === pc) log("Proiezione: signaling " + pc.signalingState);
  };
  pc.onconnectionstatechange = () => {
    if (projectionPC !== pc) return;
    log("Proiezione: connessione locale " + pc.connectionState);
    if (pc.connectionState === "connected") log("Video collegato alla finestra di proiezione.");
    if (pc.connectionState === "failed") {
      projectionConnected = false;
      failure("Il video non raggiunge la finestra di proiezione.",
        new Error("ICE locale: failed"));
    }
  };
  pc.onicecandidate = event => {
    if (event.candidate) projectionEmit("candidate-to-projection",
      {session, candidate:event.candidate.toJSON()});
  };
  pc.createOffer()
    .then(offer => pc.setLocalDescription(offer))
    .then(() => {
      log("Proiezione: offerta locale inviata.", "SDP: " + (pc.localDescription?.sdp?.length || 0) + " caratteri");
      return projectionEmit("offer",{session, sdp:pc.localDescription});
    })
    .catch(error => {
      projectionConnected = false;
      failure("Impossibile avviare la proiezione locale.", error);
    });
}

Events.On("sadit:projection:ready", () => {
  log("Proiezione: ricevuto READY dalla seconda finestra.");
  if (role === "room" && remoteStream && !projectionConnected) sendProjectionOffer();
});
Events.On("sadit:projection:answer", async event => {
  const msg = event.data || {};
  if (!projectionPC || !projectionSession || msg.session !== projectionSession) return;
  try {
    await projectionPC.setRemoteDescription(msg.sdp);
    const waiting = pendingProjectionICE.splice(0);
    for (const candidate of waiting) await projectionPC.addIceCandidate(candidate);
    log("Proiezione: risposta SDP applicata dalla seconda finestra.");
  } catch (error) { failure("Errore durante il collegamento video locale.", error); }
});
Events.On("sadit:projection:candidate-to-room", async event => {
  const msg = event.data || {};
  if (!projectionPC || !projectionSession || msg.session !== projectionSession) return;
  try {
    if (projectionPC.remoteDescription) await projectionPC.addIceCandidate(msg.candidate);
    else pendingProjectionICE.push(msg.candidate);
  } catch (error) { log("Candidato ICE locale non valido.", error.message, "error"); }
});
Events.On("sadit:projection:debug", event => {
  const msg = event.data || {};
  log("Finestra di proiezione: " + (msg.message || "evento"), msg.details || "");
});
Events.On("sadit:projection:status", event => {
  const msg = event.data || {};
  if (msg.session !== projectionSession) return;
  if (msg.status === "track") log("La finestra di proiezione ha ricevuto la traccia video.");
  else if (msg.status === "connected") log("Proiezione attiva.");
  else failure("La connessione della finestra di proiezione si è interrotta.",
    new Error(String(msg.status)));
});
Events.On("sadit:projection:error", event => {
  const msg = event.data || {};
  if (msg.session === projectionSession)
    failure("Errore nella finestra di proiezione.", new Error(msg.message || "Errore sconosciuto"));
});
$("chooseInterpreter").onclick = () => newRole("interpreter");
$("chooseRoom").onclick = () => newRole("room");
$("changeRole").onclick = () => {
  disconnect(false);
  role = null;
  $("workspace").classList.add("hidden");
  $("roleScreen").classList.remove("hidden");
  $("changeRole").classList.add("hidden");
  $("roleTitle").textContent = "Sottotitolazione attiva";
  $("statusText").textContent = "Seleziona un ruolo per iniziare.";
};

// Stop only the video: keep the session, chat and incoming audio alive.
function stopSharing() {
  if (role !== "interpreter") return;
  const track = localStream?.getVideoTracks()[0];
  if (!track || track.readyState === "ended") return;
  switchingSharing = true;
  track.stop();
  switchingSharing = false;
  log("Condivisione interrotta. Puoi selezionare un'altra finestra.");
  setStatus("Condivisione sospesa", "waiting");
}

// Switch the shared window in the existing PeerJS call without renegotiation.
async function changeSharing() {
  if (role !== "interpreter" || !media?.peerConnection) {
    log("Per cambiare finestra, attendi prima la connessione della Sala.");
    return;
  }
  let next = null;
  try {
    switchingSharing = true;
    next = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
    const track = next.getVideoTracks()[0];
    const sender = media.peerConnection.getSenders().find(item=>item.track?.kind==="video");
    if (!sender) throw new Error("Il collegamento non contiene una traccia video sostituibile.");
    await sender.replaceTrack(track);
    localStream?.getTracks().forEach(old => old.stop());
    localStream = next;
    track.addEventListener("ended", () => { if (!switchingSharing) stopSharing(); });
    setStatus("Nuova condivisione attiva", "connected");
    log("Finestra condivisa modificata.");
  } catch(e) {
    next?.getTracks().forEach(track=>track.stop());
    failure("Non riesco a cambiare la finestra condivisa.",e);
  } finally {
    switchingSharing = false;
  }
}

function confirmDisconnect() {
  if (window.confirm("Disconnettere SA.DIT e interrompere i flussi audio e video?")) disconnect();
}
$("startInterpreter").onclick = () => busy && peer ? confirmDisconnect() : startInterpreter();
$("joinRoom").onclick = () => busy && peer ? confirmDisconnect() : joinRoom();
$("changeSharing").onclick = changeSharing;
$("stopSharing").onclick = stopSharing;
$("openProjection").onclick = () => startProjection().catch(e => failure("Non riesco ad aprire la finestra di proiezione.",e));
// The primary connection buttons handle confirmed disconnection.
$("refreshDevice").onclick = () => refreshDevices(true);
$("clearLog").onclick = () => $("log").replaceChildren();
$("copyLog").onclick = async () => {
  const content = [...$("log").querySelectorAll(".log-entry")].map(entry => {
    const time = entry.querySelector(".time")?.textContent || "";
    const message = entry.querySelector(".message")?.textContent || "";
    const detail = entry.querySelector(".detail")?.textContent || "";
    return time + " " + message + (detail ? "\n    " + detail : "");
  }).join("\n");
  if (!content) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(content);
    $("copyLog").textContent = "Copiato";
  } catch (error) {
    const field = document.createElement("textarea");
    field.value = content;
    field.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (copied) $("copyLog").textContent = "Copiato";
    else log("Non riesco a copiare il log.", error.message, "error");
  }
  setTimeout(() => { $("copyLog").textContent = "Copia"; }, 1500);
};
$("chatForm").onsubmit = sendChat;
$("copyPIN").onclick = async () => {
  try { await navigator.clipboard.writeText($("pinDisplay").textContent); }
  catch { log("Non riesco a copiare il PIN: selezionalo manualmente."); }
};
$("pinInput").addEventListener("input", e => e.target.value = e.target.value.replace(/\D/g,"").slice(0,6));
// Allow changing the room microphone without disconnecting the interpreter.
async function chooseRoomInput(deviceId) {
  if (role !== "room" || !media?.peerConnection || !localStream) return;
  const sender = media.peerConnection.getSenders().find(s => s.track?.kind === "audio");
  if (!sender) throw new Error("Non è disponibile un canale audio attivo.");
  const replacement = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false
  });
  try {
    await sender.replaceTrack(replacement.getAudioTracks()[0]);
  } catch(error) {
    replacement.getTracks().forEach(t=>t.stop());
    throw error;
  }
  const old = localStream;
  localStream = replacement;
  old.getTracks().forEach(t=>t.stop());
  log("Ingresso audio della Sala modificato.", replacement.getAudioTracks()[0]?.label || "Predefinito");
}
$("deviceSelect").onchange = async () => {
  const select = $("deviceSelect");
  const id = select.value;
  const previous = role === "room" ? (preferences.inputDeviceId || "") : (preferences.outputDeviceId || "");
  select.disabled = true;
  try {
    if (role === "room") await chooseRoomInput(id);
    else if (role === "interpreter") await chooseAudioSink(id);
    await savePrefs(role === "room" ? {inputDeviceId:id} : {outputDeviceId:id});
  } catch(e) {
    select.value = previous;
    failure("Non riesco a cambiare il dispositivo audio.", e);
  } finally { select.disabled = false; }
};
navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
// Audio element is not visible, but must exist for WebRTC playback.
const audio = document.createElement("audio");
audio.id = "incomingAudio";
audio.autoplay = true;
document.body.append(audio);
try {
  const config = await initSettings({
    getRole: () => role,
    setSignaling: cfg => { signaling=cfg; },
    setPreferences: prefs => { preferences=prefs; },
    chooseDevice: id => { $("deviceSelect").value=id; if(role==="interpreter")chooseAudioSink(id); },
    refreshDevices,
    log,
  });
  savePrefs = async partial => {
    await config.savePrefs(partial);
    Object.assign(preferences,partial);
  };
} catch(e) {
  failure("Non riesco a leggere le impostazioni.",e);
}
