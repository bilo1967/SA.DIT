// Mock the Web Speech API without requiring a browser, microphone or cloud service.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const asModule = content => "data:text/javascript;base64," + Buffer.from(content).toString("base64");
const formatter = asModule(readFileSync(new URL("../frontend/voice-format.js", import.meta.url), "utf8"));
const source = readFileSync(new URL("../frontend/speech-test.js", import.meta.url), "utf8")
  .replace('"./voice-format.js"', '"' + formatter + '"');
const { initSpeechTest } = await import(asModule(source));

function createUI() {
  const button = { disabled: false, textContent: "", onclick: null };
  const status = { textContent: "" };
  const interim = { textContent: "" };
  const entries = [];
  return { button, status, interim, entries, log: (...args) => entries.push(args) };
}

test("gracefully disables recognition when Web Speech API is unavailable", () => {
  globalThis.window = {};
  const ui = createUI();
  const speech = initSpeechTest(ui);
  assert.equal(speech.supported, false);
  assert.equal(ui.button.disabled, true);
  assert.match(ui.status.textContent, /non disponibile/);
});

test("uses default microphone, captures interim and final text, and aborts on stop", () => {
  let instance = null;
  class MockRecognition {
    constructor() { instance = this; this.aborted = false; }
    start() { this.onstart?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  }
  globalThis.window = { webkitSpeechRecognition: MockRecognition };
  const ui = createUI();
  const speech = initSpeechTest(ui);
  assert.equal(speech.supported, true);
  ui.button.onclick();
  assert.equal(instance.lang, "it-IT");
  assert.equal(instance.continuous, true);
  assert.equal(instance.interimResults, true);
  assert.equal(speech.active, true);
  instance.onresult({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: "Buongiorno", confidence: 0.9 }], { isFinal: true }),
      Object.assign([{ transcript: "a tutti", confidence: 0 }], { isFinal: false }),
    ],
  });
  assert.equal(ui.interim.textContent, "a tutti");
  assert(ui.entries.some(([message]) => message === "Trascrizione: Buongiorno"));
  ui.button.onclick();
  assert.equal(instance.aborted, true);
  assert.equal(speech.active, false);
  assert.equal(ui.button.textContent, "Avvia riconoscimento");
});

test("sends idempotent cumulative snapshots and preserves newlines", () => {
  let instance;
  class MockRecognition {
    constructor() { instance = this; }
    start() { this.onstart?.(); }
    abort() { this.onend?.(); }
  }
  globalThis.window = { SpeechRecognition: MockRecognition };
  const ui = createUI();
  const payloads = [];
  const speech = initSpeechTest({
    ...ui,
    getCommands: () => [{t:"a capo",r:"\n"}, {t:"virgola",r:", "}],
    onTranscript: item => payloads.push(item),
  });
  speech.start();
  instance.onresult({resultIndex:0,results:[
    Object.assign([{transcript:"ciao a capo mondo"}],{isFinal:true}),
  ]});
  assert.equal(payloads.at(-1).final,"Ciao\n mondo");
  assert.equal(payloads.at(-1).interim,"");
  assert.equal(payloads.at(-1).revision,1);
  speech.stop();
});
