package main

import (
  "errors"
  "fmt"
  "os"
  "strings"
)

// VoiceCommand is the portable equivalent of DIT.tafono's tagwords {t, r}.
// Both fields are persisted verbatim, including leading/trailing whitespace.
type VoiceCommand struct {
  Trigger string `json:"t"`
  Replacement string `json:"r"`
}

// VoiceCommandsService handles an independently editable voice-commands.json file.
type VoiceCommandsService struct{}

// Default commands are taken from DIT.tafono's validated tagwords array.
func defaultVoiceCommands() []VoiceCommand {
  return []VoiceCommand{
    {"a capo", "\n"}, {"altra riga", "\n"}, {"altro paragrafo", "\n\n"},
    {"lettera maiuscola", "#M"}, {"punto fermo", ". "},
    {"punto e virgola", "; "}, {"virgola", ", "}, {"due punti", ": "},
    {"parentesi aperta", "("}, {"parentesi chiusa", ")"},
    {"trattino", " - "}, {"percento", "% "},
    {"virgolette apri", " \""}, {"virgolette chiudi", "\" "},
    {"punto esclamativo", "! "}, {"punto interrogativo", "? "},
    {"sbarretta", " / "}, {"sbarretta inversa", " \\ "},
    {"segno più", " + "}, {"a commerciale", "@"},
    {"e commerciale", "&"}, {"puntini di sospensione", "…"},
  }
}

func validateVoiceCommands(list []VoiceCommand) error {
  if len(list) > 300 { return errors.New("troppi comandi vocali (massimo 300)") }
  for i, item := range list {
    if strings.TrimSpace(item.Trigger) == "" { return fmt.Errorf("comando %d: espressione vuota", i+1) }
    if len(item.Trigger) > 160 || len(item.Replacement) > 300 { return fmt.Errorf("comando %d troppo lungo", i+1) }
  }
  return nil
}

func (*VoiceCommandsService) Load() ([]VoiceCommand, error) {
 var items []VoiceCommand
 err := readJSON("voice-commands.json", &items)
 if errors.Is(err, os.ErrNotExist) { return defaultVoiceCommands(), nil }
 if err != nil { return nil, err }
 if items == nil { return nil, errors.New("voice-commands.json deve contenere un array JSON") }
 if err := validateVoiceCommands(items); err != nil { return nil, err }
 return items, nil
}

func (*VoiceCommandsService) Save(items []VoiceCommand) error {
 if err := validateVoiceCommands(items); err != nil { return err }
 return saveJSON("voice-commands.json", items)
}
