package main

import (
 "encoding/json"
 "fmt"
 "os"
 "path/filepath"
 "sync"
 "strings"
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

// finalSegmentLine preserves the raw result including significant leading and
// trailing spaces. Embedded newlines are escaped to keep one result per line.
func finalSegmentLine(raw string) string {
 return strings.NewReplacer("\\", "\\\\", "\r", "\\r", "\n", "\\n").Replace(raw) + "\n"
}

// appendKrokoFinalSegment stores the recognizer's final output before any
// voice-command substitution, trimming, or sentence formatting.
func appendKrokoFinalSegment(raw string) error {
 exe, err := os.Executable()
 if err != nil { return err }
 return writeKrokoFinalSegment(filepath.Join(filepath.Dir(exe), "logs"), raw)
}

func writeKrokoFinalSegment(dir, raw string) error {
 krokoDebugMu.Lock()
 defer krokoDebugMu.Unlock()
 if err := os.MkdirAll(dir, 0700); err != nil { return err }
 path := filepath.Join(dir, "kroko-final-segments.txt")
 file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
 if err != nil { return err }
 defer file.Close()
 _, err = file.WriteString(finalSegmentLine(raw))
 return err
}
