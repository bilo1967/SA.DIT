package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ICEServer describes a STUN or TURN endpoint. TURN credentials are local only.
type ICEServer struct {
	URLs       string `json:"urls"`
	Username   string `json:"username,omitempty"`
	Credential string `json:"credential,omitempty"`
}

// SignalingConfig is shared by both application roles.
type SignalingConfig struct {
	Host       string      `json:"host"`
	Port       int         `json:"port"`
	Path       string      `json:"path"`
	Secure     bool        `json:"secure"`
	ICEServers []ICEServer `json:"iceServers"`
}

// Preferences stores only role-specific choices, not connection secrets.
type Preferences struct {
	Role          string `json:"role"`
	InputDeviceID string `json:"inputDeviceId"`
	OutputDeviceID string `json:"outputDeviceId"`
	HideProjectionTitlebar bool `json:"hideProjectionTitlebar"`
}

// ConfigService reads AppData first, then the executable directory.
type ConfigService struct{}

// configDirs returns directories in lookup priority order.
func configDirs() (string, string, error) {
	userBase, err := os.UserConfigDir()
	if err != nil { return "", "", err }
	executable, err := os.Executable()
	if err != nil { return "", "", err }
	return filepath.Join(userBase, "SA.DIT"), filepath.Dir(executable), nil
}

// resolveConfigPath chooses an existing config from AppData or beside the EXE.
// If neither exists, save a newly created configuration into AppData.
func resolveConfigPath(file, appDataDir, executableDir string) (string, error) {
	if file != "signaling.json" && file != "preferences.json" {
		return "", fmt.Errorf("unsupported config filename: %s", file)
	}
	for _, dir := range []string{appDataDir, executableDir} {
		path := filepath.Join(dir, file)
		info, err := os.Stat(path)
		if err == nil {
			if info.IsDir() { return "", fmt.Errorf("%s is a directory", path) }
			return path, nil
		}
		if !errors.Is(err, os.ErrNotExist) { return "", err }
	}
	return filepath.Join(appDataDir, file), nil
}

func configPath(file string) (string, error) {
	appDataDir, executableDir, err := configDirs()
	if err != nil { return "", err }
	return resolveConfigPath(file, appDataDir, executableDir)
}

func defaultSignaling() SignalingConfig {
	return SignalingConfig{
		Host: "0.peerjs.com", Port: 443, Path: "/", Secure: true,
		ICEServers: []ICEServer{
			{URLs: "stun:stun.l.google.com:19302"},
			{URLs: "stun:stun1.l.google.com:19302"},
		},
	}
}

func defaultPreferences() Preferences {
	return Preferences{Role: "interpreter"}
}

func readJSON(file string, value any) error {
	path, err := configPath(file)
	if err != nil { return err }
	data, err := os.ReadFile(path)
	if err != nil { return err }
	if err := json.Unmarshal(data, value); err != nil { return fmt.Errorf("%s: %w", file, err) }
	return nil
}

func saveJSON(file string, value any) error {
	path, err := configPath(file)
	if err != nil { return err }
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil { return err }
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil { return err }
	data = append(data, '\n')
	// Atomic rename keeps an interrupted save from truncating the active config.
	tmp, err := os.CreateTemp(dir, ".sadit-*.tmp")
	if err != nil { return err }
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0600); err != nil { tmp.Close(); return err }
	if _, err := tmp.Write(data); err != nil { tmp.Close(); return err }
	if err := tmp.Close(); err != nil { return err }
	// On Windows, os.Rename does not replace an existing destination atomically.
	// Existing file is backed up until the new file has been installed.
	if err := os.Rename(tmpPath, path); err == nil { return nil }
	old := path + ".bak"
	_ = os.Remove(old)
	if err := os.Rename(path, old); err != nil && !errors.Is(err, os.ErrNotExist) { return err }
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Rename(old, path)
		return err
	}
	_ = os.Remove(old)
	return nil
}

// LoadSignaling returns the persisted network configuration or safe defaults.
func (*ConfigService) LoadSignaling() (SignalingConfig, error) {
	cfg := defaultSignaling()
	err := readJSON("signaling.json", &cfg)
	if errors.Is(err, os.ErrNotExist) { return cfg, nil }
	return cfg, err
}

// SaveSignaling validates and persists shared signaling and ICE settings.
func (*ConfigService) SaveSignaling(cfg SignalingConfig) error {
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.Path = strings.TrimSpace(cfg.Path)
	if cfg.Host == "" || strings.ContainsAny(cfg.Host, "/ \\") { return errors.New("hostname PeerJS non valido") }
	if cfg.Port < 1 || cfg.Port > 65535 { return errors.New("porta PeerJS non valida") }
	if !strings.HasPrefix(cfg.Path, "/") { return errors.New("il path PeerJS deve iniziare con /") }
	if len(cfg.ICEServers) > 12 { return errors.New("troppi server ICE") }
	for i := range cfg.ICEServers {
		s := &cfg.ICEServers[i]
		s.URLs = strings.TrimSpace(s.URLs)
		if !(strings.HasPrefix(s.URLs, "stun:") || strings.HasPrefix(s.URLs, "stuns:") ||
			strings.HasPrefix(s.URLs, "turn:") || strings.HasPrefix(s.URLs, "turns:")) {
			return fmt.Errorf("URL ICE non valido nella riga %d", i+1)
		}
	}
	return saveJSON("signaling.json", cfg)
}

// LoadPreferences returns persisted audio choices, with defaults if not present.
func (*ConfigService) LoadPreferences() (Preferences, error) {
	p := defaultPreferences()
	err := readJSON("preferences.json", &p)
	if errors.Is(err, os.ErrNotExist) { return p, nil }
	if p.Role == "project" { p.Role = "interpreter" }
	if p.Role == "receive" { p.Role = "room" }
	return p, err
}

// SavePreferences persists the local device and role preferences.
func (*ConfigService) SavePreferences(p Preferences) error {
	if p.Role != "interpreter" && p.Role != "room" { return errors.New("ruolo non valido") }
	return saveJSON("preferences.json", p)
}
