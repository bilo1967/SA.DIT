package main

import (
 "os"
 "path/filepath"
 "testing"
)

func TestPortableConfigPath(t *testing.T) {
 root := t.TempDir()
 for _, name := range []string{"signaling.json","preferences.json","voice-commands.json","kroko.json"} {
  got, err := portableConfigPath(root, name)
  if err != nil { t.Fatal(err) }
  want := filepath.Join(root, "config", name)
  if got != want { t.Fatalf("%s: got %s want %s",name,got,want) }
 }
 for _, invalid := range []string{"../preferences.json", "other.json", "config/signaling.json"} {
  if _, err := portableConfigPath(root, invalid); err == nil {
   t.Fatalf("invalid filename accepted: %s", invalid)
  }
 }
}

func TestPortableConfigDirectoryDoesNotFallback(t *testing.T) {
 root := t.TempDir()
 got, err := portableConfigPath(root,"signaling.json")
 if err != nil { t.Fatal(err) }
 old := filepath.Join(root, "signaling.json")
 if err := os.WriteFile(old, []byte("{}"), 0600); err != nil { t.Fatal(err) }
 if got == old { t.Fatal("legacy config location must not be used") }
}

func TestKrokoConfigValidation(t *testing.T) {
 cfg := defaultKrokoConfig()
 if err := cfg.validate(); err != nil { t.Fatal(err) }
 cfg.Rule2MinTrailingSilence = -1
 if err := cfg.validate(); err == nil { t.Fatal("negative endpoint silence accepted") }
 cfg = defaultKrokoConfig()
 cfg.Rule3MinUtteranceLength = 0
 if err := cfg.validate(); err == nil { t.Fatal("invalid max utterance accepted") }
}
