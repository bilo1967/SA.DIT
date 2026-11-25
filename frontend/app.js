"use strict";

// WebRTC proof of concept: signaling is exchanged manually, without PeerJS.
const $ = (id) => document.getElementById(id);
const log = (message) => {
  const line = new Date().toLocaleTimeString() + "  " + message;
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
};
let peer = null;
let captured = [];
let mode = "project";
let generation = 0;

function setStatus(message) {
  $("state").textContent = message;
}

function updateRole() {
  mode = $("role").value;
  $("projectControls").classList.toggle("hidden", mode !== "project");
  $("projectAnswer").classList.toggle("hidden", mode !== "project");
  $("receiveControls").classList.toggle("hidden", mode !== "receive");
  $("noVideo").textContent = mode === "project"
    ? "In questa modalità si riceve l'audio dal PC remoto."
    : "Il video dell'interprete comparirà qui dopo la connessione.";
}

function reset() {
  generation++;
  if (peer) {
    peer.ontrack = null;
    peer.close();
    peer = null;
  }
  for (const stream of captured) {
    stream.getTracks().forEach((track) => track.stop());
  }
  captured = [];
  $("remoteVideo").srcObject = null;
  $("remoteAudio").srcObject = null;
  $("remoteVideo").classList.add("hidden");
  $("noVideo").classList.remove("hidden");
  $("incoming").value = "";
  $("outgoing").value = "";
  $("connection").textContent = "Non connesso";
  setStatus("Pronto");
  $("role").disabled = false;
  $("offer").disabled = false;
  $("answer").disabled = false;
  log("Sessione terminata.");
}

function createPeer() {
  // No STUN or TURN is required for a same-PC test.
  // A public STUN helps on some LANs, but this first prototype
  // does not claim cross-NAT connectivity without TURN.
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  pc.onconnectionstatechange = () => {
    $("connection").textContent = pc.connectionState;
    log("Connessione: " + pc.connectionState);
    if (pc.connectionState === "connected") setStatus("Connesso");
    if (pc.connectionState === "failed") setStatus("Connessione fallita");
  };
  pc.oniceconnectionstatechange = () => log("ICE: " + pc.iceConnectionState);
  pc.ontrack = (event) => {
    const track = event.track;
    const element = track.kind === "audio" ? $("remoteAudio") : $("remoteVideo");
    const stream = element.srcObject instanceof MediaStream ? element.srcObject : new MediaStream();
    stream.addTrack(track);
    element.srcObject = stream;
    if (track.kind === "video") {
      element.classList.remove("hidden");
      $("noVideo").classList.add("hidden");
    } else {
      refreshDevices();
    }
    element.play().catch((error) => log("Riproduzione " + track.kind + ": " + error.message));
    log("Traccia ricevuta: " + track.kind);
  };
  peer = pc;
  $("role").disabled = true;
  return pc;
}

function waitForICE(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Timeout raccolta ICE (20 s)")), 20000);
    function change() {
      if (pc.iceGatheringState === "complete") finish();
    }
    function finish(error) {
      clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", change);
      error ? reject(error) : resolve();
    }
    pc.addEventListener("icegatheringstatechange", change);
    change();
  });
}

function parseSDP(value, expected) {
  const description = JSON.parse(value);
  if (!description || description.type !== expected || typeof description.sdp !== "string" || !description.sdp) {
    throw new Error("Attesa una segnalazione di tipo " + expected + ".");
  }
  return description;
}

async function createOffer() {
  if (peer) throw new Error("Termina la sessione precedente prima di ricominciare.");
  log("Richiesta cattura finestra/schermo...");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  captured.push(stream);
  const pc = createPeer();
  stream.getVideoTracks().forEach((track) => {
    pc.addTrack(track, stream);
    track.addEventListener("ended", () => { log("Condivisione terminata."); reset(); }, { once: true });
  });
  // Reserve an audio m-line for the remote microphone/system sound.
  pc.addTransceiver("audio", { direction: "recvonly" });
  await pc.setLocalDescription(await pc.createOffer());
  log("Raccolta candidati ICE...");
  await waitForICE(pc);
  $("outgoing").value = JSON.stringify(pc.localDescription);
  setStatus("Offerta pronta");
  log("Invia l'offerta al PC in modalità Riceve.");
}

async function captureAudio() {
  if ($("audioSource").value === "microphone") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    captured.push(stream);
    return stream.getAudioTracks()[0];
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: "include"
  });
  captured.push(stream);
  const audio = stream.getAudioTracks()[0];
  if (!audio) throw new Error("WebView2 non ha fornito l'audio dello schermo. Prova Microfono.");
  // Keep the video capture track active; only transmit the audio track.
  return audio;
}

async function createAnswer() {
  if (peer) throw new Error("Termina la sessione precedente prima di ricominciare.");
  const offer = parseSDP($("incoming").value.trim(), "offer");
  const audioTrack = await captureAudio();
  const pc = createPeer();
  await pc.setRemoteDescription(offer);
  const audioTransceiver = pc.getTransceivers().find((item) => item.receiver.track.kind === "audio");
  if (!audioTransceiver) throw new Error("L'offerta non contiene un canale audio.");
  await audioTransceiver.sender.replaceTrack(audioTrack);
  audioTransceiver.direction = "sendonly";
  await pc.setLocalDescription(await pc.createAnswer());
  log("Raccolta candidati ICE...");
  await waitForICE(pc);
  $("outgoing").value = JSON.stringify(pc.localDescription);
  setStatus("Risposta pronta");
  log("Invia la risposta al PC in modalità Proietta.");
}

async function applyAnswer() {
  if (!peer || peer.signalingState !== "have-local-offer") {
    throw new Error("Crea prima un'offerta in modalità Proietta.");
  }
  const answer = parseSDP($("incoming").value.trim(), "answer");
  await peer.setRemoteDescription(answer);
  log("Risposta applicata; attesa connessione ICE.");
}

async function refreshDevices() {
  const select = $("outputDevice");
  const selected = select.value;
  select.replaceChildren(new Option("Dispositivo predefinito", ""));
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const device of devices.filter((d) => d.kind === "audiooutput")) {
      if (device.deviceId) select.add(new Option(device.label || "Uscita audio " + (select.length), device.deviceId));
    }
    if (Array.from(select.options).some((item) => item.value === selected)) select.value = selected;
  } catch (error) { log("Dispositivi: " + error.message); }
}

async function chooseOutput() {
  const audio = $("remoteAudio");
  if (typeof audio.setSinkId !== "function") {
    log("Selezione uscita non disponibile in questo WebView2; usa il dispositivo di sistema.");
    $("outputDevice").value = "";
    return;
  }
  await audio.setSinkId($("outputDevice").value);
  log("Uscita audio impostata.");
}

function run(action) {
  return async () => {
    try {
      setStatus("Operazione in corso");
      await action();
    } catch (error) {
      setStatus("Errore");
      log("ERRORE: " + error.message);
      // A failed capture or SDP operation must not leave devices active.
      reset();
      setStatus("Errore: " + error.message);
    }
  };
}

$("role").addEventListener("change", updateRole);
$("reset").addEventListener("click", reset);
$("offer").addEventListener("click", run(createOffer));
$("answer").addEventListener("click", run(createAnswer));
$("applyAnswer").addEventListener("click", run(applyAnswer));
$("devices").addEventListener("click", run(refreshDevices));
$("outputDevice").addEventListener("change", run(chooseOutput));
$("playAudio").addEventListener("click", run(async () => { await $("remoteAudio").play(); log("Audio riattivato."); }));
$("copy").addEventListener("click", async () => {
  if (!$("outgoing").value) return;
  try {
    await navigator.clipboard.writeText($("outgoing").value);
    $("copyStatus").textContent = "Copiato";
  } catch {
    $("outgoing").focus();
    $("outgoing").select();
    $("copyStatus").textContent = "Premi Ctrl+C per copiare";
  }
});
updateRole();
refreshDevices();
log("Pronto. Avvia due copie di SA.DIT, una per modalità.");
