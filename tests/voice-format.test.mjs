import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";
const source=readFileSync(new URL("../frontend/voice-format.js",import.meta.url),"utf8");
const {cleanEdgeSegment,applyVoiceCommands,appendReviewedSegment,reviewPunctuation,isPunctuationOnly,stripEdgePunctuationAfterCommand}=
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
  assert.equal(reviewPunctuation("ciao,mondo;oggi:sera!bene?domani."),"ciao, mondo; oggi: sera! Bene? Domani.");
  assert.equal(reviewPunctuation("ciao,\nmondo"),"ciao,\nmondo");
  assert.equal(reviewPunctuation("ciao... mondo"),"ciao... mondo");
  assert.equal(appendReviewedSegment("","ciao. mondo"),"Ciao. Mondo");
  assert.equal(appendReviewedSegment("","ciao! mondo"),"Ciao! Mondo");
  assert.equal(appendReviewedSegment("","ciao? mondo"),"Ciao? Mondo");
});

test("discard output containing only punctuation after substitutions",()=>{
  for(const value of ["", ".", ". ?", "?!", " : , ! ", "…"]) assert.equal(isPunctuationOnly(value),true);
  assert.equal(isPunctuationOnly("ciao."),false);
  const commands=[{t:"punto fermo",r:". "},{t:"punto interrogativo",r:"? "}];
  assert.equal(isPunctuationOnly(applyVoiceCommands("punto fermo",commands)),true);
  assert.equal(isPunctuationOnly(applyVoiceCommands("punto interrogativo",commands)),true);
  assert.equal(stripEdgePunctuationAfterCommand("ciao punto fermo?",commands),"ciao punto fermo");
  assert.equal(stripEdgePunctuationAfterCommand("ciao punto fermo.",commands),"ciao punto fermo");
  assert.equal(stripEdgePunctuationAfterCommand("ciao?",commands),"ciao?");
});
