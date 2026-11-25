// SA.DIT - one desktop app, two roles, compact interface, PeerJS and local projection.
import { Call } from "/wails/runtime.js";
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
const projectionChannel = new BroadcastChannel("sadit-projection");

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
  $("deviceSelect").disabled = yes && role === "room";
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
function makePeer(id) {
  if (!window.Peer) throw new Error("La libreria PeerJS non è disponibile. Verifica la connessione Internet.");
  const p = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
  p.on("error", e => failure("Errore del collegamento PeerJS.", e));
  p.on("disconnected", () => setStatus("Signaling disconnesso", "waiting"));
  p.on("close", () => setStatus("Connessione terminata"));
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
    connectionActive(true);
    setStatus("Collegato alla controparte", "connected");
    log("Canale chat e segnalazione attivo.");
  });
  data.on("data", payload => {
    if (payload && payload.type === "chat" && typeof payload.text === "string") addMessage(payload.text.slice(0, 2000));
  });
  data.on("close", () => {
    connectionActive(false);
    setStatus("Controparte scollegata", "waiting");
    log("La controparte si è scollegata.");
  });
  data.on("error", error => failure("La chat non è disponibile.", error));
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
  try { media?.close(); } catch {}
  try { data?.close(); } catch {}
  try { peer?.destroy(); } catch {}
  media = null;
  data = null;
  peer = null;
}
function disconnect(writeLog = true) {
  closeNetwork();
  stopTracks();
  remoteStream = null;
  busy = false;
  projectionChannel.postMessage({type:"stop"});
  try { projectionPC?.close(); } catch {}
  projectionPC = null;
  pendingProjectionICE = [];
  projectionConnected = false;
  clearTimeout(projectionHandshakeTimer);
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
      if (media) { incomingCall.close(); return; }
      media = incomingCall;
      incomingCall.answer(localStream);
      incomingCall.on("stream", stream => {
        $("incomingAudio").srcObject = stream;
        chooseAudioSink($("deviceSelect").value);
        $("incomingAudio").play().catch(e => log("Premi sulla finestra per autorizzare l'ascolto.", e.message));
        log("Audio della sala ricevuto.");
      });
      incomingCall.on("error", e => failure("Ricezione audio interrotta.", e));
      incomingCall.on("close", () => log("Flusso audio/video terminato."));
    });
    peer.on("open", () => {
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
async function joinRoom() {
  if (busy) return;
  const pin = $("pinInput").value.trim();
  if (!/^\d{6}$/.test(pin)) { failure("Inserisci il PIN di sei cifre dell'interprete."); return; }
  busy = true;
  $("joinRoom").disabled = true;
  setStatus("Collegamento con l'interprete", "waiting");
  try {
    localStream = await selectedAudio();
    peer = makePeer();
    peer.on("open", () => {
      $("joinRoom").disabled = false;
      $("joinRoom").textContent = "Disconnettiti";
      $("joinRoom").classList.add("is-connected");
      const id = "sadit-" + pin;
      const connection = peer.connect(id, {reliable:true});
      attachData(connection);
      connection.on("open", () => {
        media = peer.call(id, localStream);
        if (!media) { failure("Non riesco a iniziare lo scambio multimediale."); return; }
        media.on("stream", stream => {
          remoteStream = stream;
          log("Video dell'interprete ricevuto.");
          startProjection().catch(e => failure("Non riesco ad aprire la proiezione.", e));
        });
        media.on("error", e => failure("Non riesco a ricevere il video dell'interprete.", e));
        media.on("close", () => { projectionChannel.postMessage({type:"stop"}); remoteStream = null; });
      });
    });
  } catch (e) {
    disconnect(false);
    failure("Non riesco a connettere la sala.", e);
  }
}
async function startProjection() {
  await Call.ByName("main.ProjectionService.Open");
  // The window may have announced ready before the remote stream arrived.
  if (remoteStream) probeProjection();
}
function probeProjection() {
  if (!remoteStream || projectionConnected) return;
  projectionChannel.postMessage({type:"probe"});
  clearTimeout(projectionHandshakeTimer);
  projectionHandshakeTimer = setTimeout(probeProjection, 800);
}
function sendChat(event) {
  event.preventDefault();
  const text = $("chatText").value.trim();
  if (!text || !data?.open) return;
  data.send({type:"chat",text});
  addMessage(text, true);
  $("chatText").value = "";
}
function sendProjectionOffer() {
  if (!remoteStream || role !== "room") return;
  clearTimeout(projectionHandshakeTimer);
  projectionConnected = true;
  try { projectionPC?.close(); } catch {}
  pendingProjectionICE = [];
  projectionPC = new RTCPeerConnection({iceServers:[]});
  projectionPC.onconnectionstatechange = () => {
    if (projectionPC?.connectionState === "connected") log("Finestra di proiezione collegata.");
    if (projectionPC?.connectionState === "failed") failure("Il video non raggiunge la finestra di proiezione.");
  };
  for (const track of remoteStream.getVideoTracks()) projectionPC.addTrack(track, remoteStream);
  projectionPC.onicecandidate = event => {
    if (event.candidate) projectionChannel.postMessage({type:"candidate-to-projection", candidate:event.candidate.toJSON()});
  };
  projectionPC.createOffer().then(offer => projectionPC.setLocalDescription(offer)).then(() => {
    projectionChannel.postMessage({type:"offer",sdp:projectionPC.localDescription});
  }).catch(e => failure("Impossibile alimentare la finestra di proiezione.", e));
}
projectionChannel.onmessage = async event => {
  const msg = event.data || {};
  if (msg.type === "ready" && !projectionConnected) sendProjectionOffer();
  if (msg.type === "answer" && projectionPC) {
    try {
      await projectionPC.setRemoteDescription(msg.sdp);
      for(const candidate of pendingProjectionICE) await projectionPC.addIceCandidate(candidate);
      pendingProjectionICE = [];
    } catch(e) { failure("Errore nella proiezione locale.",e); }
  }
  if (msg.type === "candidate-to-room" && projectionPC) {
    try {
      if(projectionPC.remoteDescription) await projectionPC.addIceCandidate(msg.candidate);
      else pendingProjectionICE.push(msg.candidate);
    } catch(e) { log("Candidato ICE locale non valido.",e.message); }
  }
};
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
$("chatForm").onsubmit = sendChat;
$("copyPIN").onclick = async () => {
  try { await navigator.clipboard.writeText($("pinDisplay").textContent); }
  catch { log("Non riesco a copiare il PIN: selezionalo manualmente."); }
};
$("pinInput").addEventListener("input", e => e.target.value = e.target.value.replace(/\D/g,"").slice(0,6));
$("deviceSelect").onchange = async () => {
  const id = $("deviceSelect").value;
  try {
    await savePrefs(role === "room" ? {inputDeviceId:id} : {outputDeviceId:id});
    if (role === "interpreter") await chooseAudioSink(id);
  } catch(e) { failure("Non riesco a salvare il dispositivo audio.",e); }
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
