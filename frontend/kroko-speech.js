// Kroko native ASR using the Wails binary stream and browser microphone.
import { Stream } from "/wails/runtime.js";
import { applyVoiceCommands, appendReviewedSegment } from "./voice-format.js";

export function initKrokoSpeech({button,status={textContent:""},interim={textContent:""},log,getCommands=()=>[],onTranscript=()=>{},onInterim=()=>{}}) {
 let desired=false, finalText="",revision=0, socket=null, microphone=null, audio=null, worklet=null, mute=null, microphoneId="", publishing=true, sessionStart=0;
 const show=()=>{ button.textContent=desired?"Interrompi riconoscimento":"Avvia riconoscimento"; };
 const clearPartial=()=>{interim.textContent="";onInterim("");};
 const emit=()=>onTranscript({type:"transcript",revision:++revision,final:finalText});
 // Clearing does not reset revisions: the remote projection only accepts newer snapshots.
 function clear(){finalText="";clearPartial();emit();}
 function setPublishing(enabled){publishing=!!enabled;}

 function stop(){
  desired=false;show();clearPartial();status.textContent="Riconoscimento interrotto";
  worklet?.disconnect();worklet=null;mute?.disconnect();mute=null;
  audio?.close().catch(()=>{});audio=null;
  microphone?.getTracks().forEach(t=>t.stop());microphone=null;
  socket?.close();socket=null;
 }
 function commit(text) {
  const raw=String(text??"");
  if (!raw.trim()) return;
  // Recognition continues while transmission is suspended. Paused segments are
  // intentionally not added to the cumulative projection snapshot.
  if (!publishing) {
   log(raw,"","transcript");
   return;
  }
  const commands=getCommands();
  // Kroko's sentence punctuation is intentionally preserved (unlike Edge).
  const processed=applyVoiceCommands(raw,commands);
  const previous=finalText;
  const forceUppercase=commands.some(({t,r})=>r==="#M"&&raw.toLocaleLowerCase("it-IT").startsWith(t.toLocaleLowerCase("it-IT")));
  finalText=appendReviewedSegment(previous,processed,{forceUppercase});
  if(finalText!==previous){log(finalText.slice(previous.length).trimStart(),"","transcript");emit();}
 }
 async function start() {
  if(desired) return;
  desired=true;show();status.textContent="Caricamento Kroko…";
  try {
   sessionStart=performance.now();
   const stream=Stream("kroko-audio");
   socket=stream;
   stream.onmessage=async event=>{
    let packet;
    try { packet=JSON.parse(new TextDecoder().decode(event.data)); } catch { return; }
    if(!desired) return;
    if(packet.type==="error"){log("Kroko: "+packet.message,"","error");stop();return;}
    if(packet.type==="final"){commit(packet.text);clearPartial();return;}
    if(packet.type==="interim"){interim.textContent=packet.text;onInterim(packet.text);return;}
    if(packet.type!=="ready") return;
    log("Kroko pronto", "Caricamento modello e stream: " + (packet.loadMs ?? "?") +
      " ms · attesa totale: " + Math.round(performance.now()-sessionStart) + " ms", "info");
    try {
     microphone=await navigator.mediaDevices.getUserMedia({audio:{
       ...(microphoneId ? {deviceId:{exact:microphoneId}} : {}),
       echoCancellation:false,noiseSuppression:false,autoGainControl:false
     },video:false});
     if(!desired){microphone.getTracks().forEach(t=>t.stop());return;}
     audio=new AudioContext();
     await audio.audioWorklet.addModule("./kroko-worklet.js");
     worklet=new AudioWorkletNode(audio,"kroko-audio",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
     mute=audio.createGain();mute.gain.value=0;
     worklet.connect(mute).connect(audio.destination);
     worklet.port.onmessage=e=>{
      if(desired&&stream.readyState===stream.OPEN&&stream.bufferedAmount<256000)stream.send(e.data);
     };
     audio.createMediaStreamSource(microphone).connect(worklet);
     await audio.resume();
     status.textContent="Kroko attivo · ascolto in corso";
    } catch(e){log("Microfono Kroko: "+e.message,"","error");stop();}
   };
   stream.onerror=()=>{if(desired){log("Connessione con Kroko interrotta","","error");stop();}};
   stream.onclose=()=>{if(desired){log("Stream Kroko chiuso","","error");stop();}};
  } catch(e){log("Kroko: "+e.message,"","error");stop();}
 }
 async function setMicrophoneId(id) {
  const next=String(id||"");
  if(microphoneId===next) return;
  microphoneId=next;
  // Changing capture device during a session restarts Kroko without clearing
  // the cumulative transcript or its revision counter.
  if(desired){stop();await start();}
 }
 button.onclick=()=>desired?stop():start();
 show();status.textContent="Pronto · Kroko italiano (locale)";
 return {start,stop,clear,setPublishing,setMicrophoneId,supported:true,get active(){return desired;},snapshot:()=>({final:finalText,revision})};
}
