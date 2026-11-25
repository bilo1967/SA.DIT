// Independent projection window: local WebRTC relay via BroadcastChannel.
// MediaStream objects cannot be posted directly to another WebView.
const channel = new BroadcastChannel("sadit-projection");
const video = document.getElementById("projection");
const placeholder = document.getElementById("placeholder");
let pc = null;
let pendingCandidates = [];
function stop() {
  pc?.close();
  pc = null;
  pendingCandidates = [];
  video.srcObject = null;
  video.style.display = "none";
  placeholder.style.display = "flex";
}
channel.onmessage = async event => {
  const msg = event.data || {};
  try {
    if (msg.type === "stop") { stop(); return; }
    if (msg.type === "probe") { channel.postMessage({type:"ready"}); return; }
    if (msg.type === "offer") {
      stop();
      pc = new RTCPeerConnection({iceServers:[]});
      pc.onicecandidate = e => {
        if(e.candidate) channel.postMessage({type:"candidate-to-room",candidate:e.candidate.toJSON()});
      };
      pc.ontrack = e => {
        video.srcObject = e.streams[0] || new MediaStream([e.track]);
        video.style.display = "block";
        placeholder.style.display = "none";
        video.play().catch(console.error);
      };
      await pc.setRemoteDescription(msg.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      channel.postMessage({type:"answer",sdp:pc.localDescription});
      for(const candidate of pendingCandidates) await pc.addIceCandidate(candidate);
      pendingCandidates = [];
    }
    if (msg.type === "candidate-to-projection") {
      if(pc?.remoteDescription) await pc.addIceCandidate(msg.candidate);
      else pendingCandidates.push(msg.candidate);
    }
  } catch (e) { console.error("SA.DIT projection:",e); placeholder.textContent="Errore di proiezione: "+e.message; }
};
channel.postMessage({type:"ready"});
window.addEventListener("beforeunload", stop);
