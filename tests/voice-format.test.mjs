import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";
const source=readFileSync(new URL("../frontend/voice-format.js",import.meta.url),"utf8");
const {cleanEdgeSegment,applyVoiceCommands,appendReviewedSegment,reviewPunctuation}=
  await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));

test("Edge cleanup before commands",()=>{
  assert.equal(cleanEdgeSegment("Buongiorno."),"Buongiorno");
  assert.equal(cleanEdgeSegment("punto fermo."),"punto fermo");
  for(const item of ["",".","!","?",",",";",":","   "]) assert.equal(cleanEdgeSegment(item),"");
  assert.equal(cleanEdgeSegment("Ciao..."),"Ciao...");
});
test("teacher-defined commands",()=>{
  const rules=[{t:"punto fermo",r:". "},{t:"virgola",r:", "},{t:"a capo",r:"\n"},
    {t:"lettera maiuscola",r:"#M"}];
  assert.equal(applyVoiceCommands("ciao punto fermo",rules),"ciao. ");
  assert.equal(applyVoiceCommands("ciao virgola mondo",rules),"ciao,  mondo");
  assert.equal(applyVoiceCommands("ciao a capo mondo",rules),"ciao\n mondo");
  assert.equal(applyVoiceCommands("lettera maiuscola prova",rules),"Prova");
  assert.equal(applyVoiceCommands("a+b",[{t:"a+b",r:"x"}]),"x");
});
test("sentence capitalization across segments and punctuation spacing",()=>{
  assert.equal(appendReviewedSegment("","buongiorno"),"Buongiorno");
  assert.equal(appendReviewedSegment("Buongiorno","Oggi"),"Buongiorno oggi");
  assert.equal(appendReviewedSegment("Ciao.","mondo"),"Ciao. Mondo");
  assert.equal(appendReviewedSegment("Ciao!","mondo"),"Ciao! Mondo");
  assert.equal(appendReviewedSegment("Ciao?","mondo"),"Ciao? Mondo");
  assert.equal(appendReviewedSegment("Ciao,","Mondo"),"Ciao, mondo");
  assert.equal(appendReviewedSegment("Ciao;","Mondo"),"Ciao; mondo");
  assert.equal(appendReviewedSegment("Ciao:","Mondo"),"Ciao: mondo");
  assert.equal(appendReviewedSegment("Ciao","Mondo"),"Ciao mondo");
  assert.equal(appendReviewedSegment("Ciao","\nmondo"),"Ciao\nmondo");
  assert.equal(appendReviewedSegment("Ciao","PROVA",{forceUppercase:true}),"Ciao PROVA");
  assert.equal(reviewPunctuation("ciao,mondo;oggi:sera!bene?domani."),"ciao, mondo; oggi: sera! bene? domani.");
  assert.equal(reviewPunctuation("ciao,\nmondo"),"ciao,\nmondo");
  assert.equal(reviewPunctuation("ciao... mondo"),"ciao... mondo");
  assert.equal(appendReviewedSegment("","ciao. mondo"),"Ciao. Mondo");
  assert.equal(appendReviewedSegment("","ciao! mondo"),"Ciao! Mondo");
  assert.equal(appendReviewedSegment("","ciao? mondo"),"Ciao? Mondo");
});
