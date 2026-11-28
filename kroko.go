package main

import (
 "encoding/binary"
 "errors"
 "math"
 "fmt"
 "os"
 "path/filepath"
 "sync"

 sherpa "github.com/k2-fsa/sherpa-onnx-go/sherpa_onnx"
 "github.com/wailsapp/wails/v3/pkg/application"
)

const krokoSampleRate = 16000

// KrokoConfig exposes endpoint timing for experiments without recompilation.
type KrokoConfig struct {
 Rule1MinTrailingSilence float32 `json:"rule1MinTrailingSilence"`
 Rule2MinTrailingSilence float32 `json:"rule2MinTrailingSilence"`
 Rule3MinUtteranceLength float32 `json:"rule3MinUtteranceLength"`
}

func defaultKrokoConfig() KrokoConfig {
 return KrokoConfig{
  Rule1MinTrailingSilence: 1.5,
  Rule2MinTrailingSilence: 0.65,
  Rule3MinUtteranceLength: 20,
 }
}

func (cfg KrokoConfig) validate() error {
 values := []float32{cfg.Rule1MinTrailingSilence,cfg.Rule2MinTrailingSilence,cfg.Rule3MinUtteranceLength}
 for _, v := range values {
  if v <= 0 || v > 120 || math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
   return errors.New("kroko.json: endpoint timing must be within (0, 120] seconds")
  }
 }
 return nil
}

func loadKrokoConfig() (KrokoConfig, error) {
 cfg := defaultKrokoConfig()
 if err := readJSON("kroko.json", &cfg); err != nil { return cfg, err }
 return cfg, cfg.validate()
}

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

  endpoint, err := loadKrokoConfig()
  if err != nil {
   _ = conn.SendJSON(map[string]string{"type":"error","message":fmt.Sprintf("Configurazione Kroko: %v", err)})
   return
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
  cfg.Rule1MinTrailingSilence = endpoint.Rule1MinTrailingSilence
  cfg.Rule2MinTrailingSilence = endpoint.Rule2MinTrailingSilence
  cfg.Rule3MinUtteranceLength = endpoint.Rule3MinUtteranceLength

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
