// Test Kroko subtitle state without microphone hardware or native DLLs.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const asModule = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const formatter = asModule(readFileSync(new URL("../frontend/voice-format.js",import.meta.url),"utf8"));
let stream;
const mockWails = asModule('export function Stream(){return globalThis.__mockKrokoStream()}');
const source = readFileSync(new URL("../frontend/kroko-speech.js",import.meta.url),"utf8")
  .replace('"/wails/runtime.js"',JSON.stringify(mockWails))
  .replace('"./voice-format.js"',JSON.stringify(formatter));
const {initKrokoSpeech} = await import(asModule(source));

function makeRecognizer() {
 const messages=[];
 const lines=[];
 stream = {close(){},onmessage:null};
 globalThis.__mockKrokoStream = ()=>stream;
 const ui={button:{textContent:"",onclick:null},status:{textContent:""},interim:{textContent:""}};
 const speech=initKrokoSpeech({
  ...ui, log: (...args)=>lines.push(args),
  onTranscript: packet=>messages.push(packet)
 });
 const receive=(type,text)=>stream.onmessage({
  data:new TextEncoder().encode(JSON.stringify({type,text}))
 });
 return {speech,receive,messages,lines,ui};
}

test("Kroko keeps recognition alive while subtitle transmission is suspended", async()=>{
 const r=makeRecognizer();
 await r.speech.start();
 r.receive("final","primo segmento");
 assert.equal(r.messages.at(-1).final,"Primo segmento");
 const count=r.messages.length;
 r.speech.setPublishing(false);
 r.receive("final","testo riservato");
 assert.equal(r.messages.length,count);
 assert.equal(r.speech.active,true);
 r.speech.setPublishing(true);
 r.receive("final","secondo segmento");
 assert.equal(r.messages.at(-1).final,"Primo segmento secondo segmento");
 assert(!r.messages.at(-1).final.includes("riservato"));
 r.speech.stop();
});

test("Kroko subtitle clearing keeps monotonically increasing revision",async()=>{
 const r=makeRecognizer();
 await r.speech.start();
 r.receive("final","ciao");
 const old=r.speech.snapshot().revision;
 r.speech.clear();
 assert(r.speech.snapshot().revision>old);
 assert.equal(r.speech.snapshot().final,"");
 r.receive("final","nuovo");
 assert.equal(r.speech.snapshot().final,"Nuovo");
 assert(r.speech.snapshot().revision>old);
 r.speech.stop();
});
