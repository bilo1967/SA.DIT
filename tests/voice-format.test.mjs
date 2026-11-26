import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const source = readFileSync(new URL("../frontend/voice-format.js",import.meta.url),"utf8");
const {applyVoiceCommands, normalizeVoiceCommands} = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64"));

test("preserves the DIT.tafono commands and newline replacements",()=>{
 const rules=normalizeVoiceCommands([
 {t:"a capo",r:"\n"}, {t:"altro paragrafo",r:"\n\n"}, {t:"virgola",r:", "},
 {t:"lettera maiuscola",r:"#M"}
 ]);
 assert.equal(applyVoiceCommands("ciao a capo mondo",rules),"Ciao\n mondo");
 assert.equal(applyVoiceCommands("ciao virgola come stai",rules),"Ciao,  come stai");
 assert.equal(applyVoiceCommands("lettera maiuscola prova",rules),"Prova");
 assert.equal(applyVoiceCommands("ciao altro paragrafo mondo",rules),"Ciao\n\n mondo");
});
test("treats keyword expressions literally rather than as regex",()=>{
 assert.equal(applyVoiceCommands("a+b",[{t:"a+b",r:"x"}]),"X");
});

test("keeps the punctuation returned by the recognizer unchanged", () => {
  assert.equal(applyVoiceCommands("ciao.", []), "Ciao.");
  assert.equal(applyVoiceCommands("ciao... mondo!", []), "Ciao... mondo!");
  assert.equal(applyVoiceCommands(".", []), ".");
  assert.equal(applyVoiceCommands("ciao,\\nmondo", []), "Ciao,\\nmondo");
});
