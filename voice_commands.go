package main

import (
  "encoding/json"
  "errors"
  "fmt"
  "os"
  "path/filepath"
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

// Unlike generic settings, the standalone voice dictionary prefers beside-EXE files.
func voiceCommandsPath() (string, error) {
  appData, exeDir, err := configDirs()
  if err != nil { return "", err }
  for _, dir := range []string{exeDir, appData} {
    path := filepath.Join(dir, "voice-commands.json")
    if info, err := os.Stat(path); err == nil {
      if info.IsDir() { return "", fmt.Errorf("%s is a directory", path) }
      return path, nil
    } else if !errors.Is(err, os.ErrNotExist) { return "", err }
  }
  // Portable distribution if beside-EXE is writable, otherwise user config.
  if f, err := os.CreateTemp(exeDir, ".sadit-write-test-*"); err == nil {
    name := f.Name()
    f.Close()
    os.Remove(name)
    return filepath.Join(exeDir, "voice-commands.json"), nil
  }
  return filepath.Join(appData, "voice-commands.json"), nil
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
  path, err := voiceCommandsPath()
  if err != nil { return nil, err }
  data, err := os.ReadFile(path)
  if errors.Is(err, os.ErrNotExist) { return defaultVoiceCommands(), nil }
  if err != nil { return nil, err }
  var items []VoiceCommand
  if err := json.Unmarshal(data, &items); err != nil { return nil, fmt.Errorf("%s: %w", path, err) }
  if items == nil { return nil, errors.New("voice-commands.json deve contenere un array JSON") }
  if err := validateVoiceCommands(items); err != nil { return nil, err }
  return items, nil
}

func (*VoiceCommandsService) Save(items []VoiceCommand) error {
  if err := validateVoiceCommands(items); err != nil { return err }
  path, err := voiceCommandsPath()
  if err != nil { return err }
  if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil { return err }
  content, err := json.MarshalIndent(items, "", "  ")
  if err != nil { return err }
  content = append(content, '\n')
  // Commit complete files rather than writing directly over the active JSON.
  temp, err := os.CreateTemp(filepath.Dir(path), ".voice-commands-*.tmp")
  if err != nil { return err }
  defer os.Remove(temp.Name())
  if _, err = temp.Write(content); err != nil { temp.Close(); return err }
  if err = temp.Close(); err != nil { return err }
  if err = os.Rename(temp.Name(), path); err == nil { return nil }
  backup := path + ".bak"
  _ = os.Remove(backup)
  if err := os.Rename(path, backup); err != nil && !errors.Is(err, os.ErrNotExist) { return err }
  if err := os.Rename(temp.Name(), path); err != nil {
    _ = os.Rename(backup, path)
    return err
  }
  _ = os.Remove(backup)
  return nil
}
