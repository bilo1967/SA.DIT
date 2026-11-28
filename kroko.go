package main

import (
 "encoding/binary"
 "fmt"
 "os"
 "path/filepath"
 "sync"

 sherpa "github.com/k2-fsa/sherpa-onnx-go/sherpa_onnx"
 "github.com/wailsapp/wails/v3/pkg/application"
)

const krokoSampleRate = 16000

// One recognizer per audio session. Decoder runs on its stream handler goroutine,
// never on the WebView audio worklet thread.
func registerKrokoStream(app *application.App) {
 var exclusive sync.Mutex
 app.HandleStream("kroko-audio", func(conn *application.StreamConn) {
  exclusive.Lock()
  defer exclusive.Unlock()
  defer conn.Close()

  executable, err := os.Executable()
  if err != nil { _ = conn.SendJSON(map[string]string{"type":"error","message":err.Error()}); return }
  modelDir := filepath.Join(filepath.Dir(executable), "models", "kroko-it")
  for _, name := range []string{"encoder.onnx","decoder.onnx","joiner.onnx","tokens.txt"} {
   if _, err := os.Stat(filepath.Join(modelDir,name)); err != nil {
    _ = conn.SendJSON(map[string]string{"type":"error","message":fmt.Sprintf("Modello Kroko mancante: %s", name)})
    return
   }
  }

  cfg := sherpa.OnlineRecognizerConfig{}
  cfg.FeatConfig = sherpa.FeatureConfig{SampleRate:krokoSampleRate,FeatureDim:80}
  cfg.ModelConfig.Transducer.Encoder = filepath.Join(modelDir,"encoder.onnx")
  cfg.ModelConfig.Transducer.Decoder = filepath.Join(modelDir,"decoder.onnx")
  cfg.ModelConfig.Transducer.Joiner = filepath.Join(modelDir,"joiner.onnx")
  cfg.ModelConfig.Tokens = filepath.Join(modelDir,"tokens.txt")
  cfg.ModelConfig.NumThreads = 2
  cfg.ModelConfig.Provider = "cpu"
  cfg.DecodingMethod = "greedy_search"
  cfg.EnableEndpoint = 1
  cfg.Rule1MinTrailingSilence = 1.5
  cfg.Rule2MinTrailingSilence = 0.65
  cfg.Rule3MinUtteranceLength = 20

  recognizer := sherpa.NewOnlineRecognizer(&cfg)
  if recognizer == nil { _ = conn.SendJSON(map[string]string{"type":"error","message":"Impossibile inizializzare Kroko"}); return }
  defer sherpa.DeleteOnlineRecognizer(recognizer)
  stream := sherpa.NewOnlineStream(recognizer)
  if stream == nil { _ = conn.SendJSON(map[string]string{"type":"error","message":"Impossibile creare lo stream Kroko"}); return }
  defer sherpa.DeleteOnlineStream(stream)
  _ = conn.SendJSON(map[string]string{"type":"ready"})
  last := ""
  for {
   frame, err := conn.Receive()
   if err != nil { return }
   if len(frame) == 0 { return }
   if len(frame)%2 != 0 { continue }
   samples := make([]float32, len(frame)/2)
   for i := range samples { samples[i] = float32(int16(binary.LittleEndian.Uint16(frame[i*2:]))) / 32768 }
   stream.AcceptWaveform(krokoSampleRate, samples)
   for recognizer.IsReady(stream) { recognizer.Decode(stream) }
   result := recognizer.GetResult(stream).Text
   if recognizer.IsEndpoint(stream) {
    if result != "" { _ = conn.SendJSON(map[string]string{"type":"final","text":result}) }
    recognizer.Reset(stream)
    last = ""
   } else if result != last {
    last = result
    _ = conn.SendJSON(map[string]string{"type":"interim","text":result})
   }
  }
 })
}
