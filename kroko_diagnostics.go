package main

import (
 "encoding/json"
 "fmt"
 "os"
 "path/filepath"
 "sync"
 "time"
)

// KrokoDiagnosticsService stores exact outgoing packets alongside the native
// recognizer events for post-session comparison.
type KrokoDiagnosticsService struct{}

var krokoDebugMu sync.Mutex

// appendKrokoDebug writes one JSON object per line, preserving significant
// whitespace in recognized strings. No audio data is recorded.
func appendKrokoDebug(kind string, payload any) error {
 krokoDebugMu.Lock()
 defer krokoDebugMu.Unlock()
 exe, err := os.Executable()
 if err != nil { return err }
 dir := filepath.Join(filepath.Dir(exe), "logs")
 if err := os.MkdirAll(dir, 0700); err != nil { return err }
 path := filepath.Join(dir, "kroko-debug.jsonl")
 file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
 if err != nil { return err }
 defer file.Close()
 record := map[string]any{
  "timestamp": time.Now().Format(time.RFC3339Nano),
  "kind": kind,
  "payload": payload,
 }
 data, err := json.Marshal(record)
 if err != nil { return err }
 data = append(data, '\n')
 if _, err = file.Write(data); err != nil {
  return fmt.Errorf("write Kroko diagnostics: %w", err)
 }
 return nil
}

// RecordTransmission receives the exact serialized packet that the Interpreter
// hands to PeerJS. It is invoked only for integrated subtitles/system controls.
func (*KrokoDiagnosticsService) RecordTransmission(packet string) error {
 if len(packet) > 300000 { return fmt.Errorf("subtitle diagnostic packet too large") }
 var value any
 if err := json.Unmarshal([]byte(packet), &value); err != nil { return err }
 return appendKrokoDebug("outgoing", value)
}
