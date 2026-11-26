import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";
const source = readFileSync(new URL("../frontend/voice-format.js", import.meta.url), "utf8");
const {cleanEdgeSegment, applyVoiceCommands, appendReviewedSegment, reviewPunctuation, isPunctuationOnly} =
  await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const rules = [
  {t:"punto fermo",r:". "}, {t:"punto interrogativo",r:"? "},
  {t:"punto esclamativo",r:"! "}, {t:"virgola",r:", "},
  {t:"punto e virgola",r:"; "}, {t:"due punti",r:": "},
  {t:"a capo",r:"\n"}, {t:"lettera maiuscola",r:"#M"},
  {t:"puntini di sospensione",r:"…"},
];
const process = raw => applyVoiceCommands(cleanEdgeSegment(raw), rules);

test("A: remove ALL strong trailing punctuation, never internal punctuation", () => {
  for (const [input, expected] of [
    ["Buongiorno.", "Buongiorno"], ["Come stai?", "Come stai"],
    ["Attenzione!!!", "Attenzione"], ["Ciao?! . ", "Ciao"],
    ["Ciao, mondo.", "Ciao, mondo"], ["Ciao. Come va?", "Ciao. Come va"],
    ["Punto fermo?", "Punto fermo"], ["", ""], ["?!", ""],
    [",", ""], ["…", ""], [" . ? ! ", ""],
  ]) assert.equal(cleanEdgeSegment(input), expected, input);
  assert.equal(isPunctuationOnly("ciao."), false);
});

test("B: explicit punctuation wins over Edge on both sides", () => {
  for (const [input, expected] of [
    ["ciao, virgola mondo.", "ciao, mondo"],
    ["ciao, punto fermo mondo.", "ciao. mondo"],
    ["ciao? punto fermo.", "ciao."],
    ["ciao, punto esclamativo!", "ciao!"],
    ["ciao; punto interrogativo, come stai?", "ciao? come stai"],
    ["punto fermo?", "."],
    ["punto interrogativo!", "?"],
    ["punto esclamativo.", "!"],
    ["virgola,", ","],
    ["ciao punto fermo, poi", "ciao. poi"],
    ["ciao punto fermo punto interrogativo", "ciao.?"],
  ]) assert.equal(process(input), expected, input);
});

test("B: non-conventional symbols, newlines, #M and literal keywords", () => {
  assert.equal(process("ciao puntini di sospensione."), "ciao …");
  assert.equal(process("ciao a capo mondo."), "ciao \n mondo");
  assert.equal(process("lettera maiuscola prova."), "Prova");
  assert.equal(applyVoiceCommands("a+b", [{t:"a+b",r:"x"}]), "x");
  assert.equal(applyVoiceCommands("capolinea", [{t:"a capo",r:"\n"}]), "capolinea");
});

test("C: normalize spacing, newlines, capitals and cumulative segments", () => {
  assert.equal(reviewPunctuation("ciao,mondo;oggi:sera!bene?domani."), "ciao, mondo; oggi: sera! Bene? Domani.");
  assert.equal(reviewPunctuation("ciao,\n mondo"), "ciao,\nmondo");
  assert.equal(appendReviewedSegment("", process("ciao.")), "Ciao");
  assert.equal(appendReviewedSegment("Ciao", process("punto fermo?")), "Ciao.");
  assert.equal(appendReviewedSegment("Ciao.", process("punto fermo?")), "Ciao.");
  assert.equal(appendReviewedSegment("Ciao.", process("mondo.")), "Ciao. Mondo");
  assert.equal(appendReviewedSegment("Ciao,", process("Mondo.")), "Ciao, mondo");
  assert.equal(appendReviewedSegment("Ciao", process("Oggi.")), "Ciao oggi");
  assert.equal(appendReviewedSegment("Ciao", process("a capo mondo.")), "Ciao\nmondo");
  assert.equal(appendReviewedSegment("Ciao", "PROVA", {forceUppercase:true}), "Ciao PROVA");
});
