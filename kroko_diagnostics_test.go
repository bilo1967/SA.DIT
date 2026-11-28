package main

import (
 "os"
 "path/filepath"
 "strings"
 "testing"
)

func TestFinalSegmentLinePreservesWhitespace(t *testing.T) {
 cases := []struct{ raw, want string }{
  {"  virgola a capo,  ", "  virgola a capo,  \n"},
  {", che", ", che\n"},
  {"invent", "invent\n"},
  {"ò ", "ò \n"},
  {"linea\nnuova", "linea\\nnuova\n"},
  {"a\\b", "a\\\\b\n"},
 }
 for _, c := range cases {
  if got:=finalSegmentLine(c.raw); got!=c.want {
   t.Errorf("raw %q: got %q, want %q", c.raw, got, c.want)
  }
 }
}

func TestFinalSegmentFileAppendsOneLinePerResult(t *testing.T) {
 dir := t.TempDir()
 inputs:=[]string{" invent", "ò", ", a capo, "}
 for _, raw:=range inputs {
  if err:=writeKrokoFinalSegment(dir,raw); err!=nil { t.Fatal(err) }
 }
 data,err:=os.ReadFile(filepath.Join(dir,"kroko-final-segments.txt"))
 if err!=nil { t.Fatal(err) }
 if got,want:=string(data),strings.Join(inputs,"\n")+"\n"; got!=want {
  t.Fatalf("got %q want %q",got,want)
 }
}
