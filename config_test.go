package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveConfigPath(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "appdata")
	exe := filepath.Join(root, "portable")
	for _, dir := range []string{app, exe} {
		if err := os.MkdirAll(dir, 0700); err != nil { t.Fatal(err) }
	}
	file := "signaling.json"
	resolve := func() string {
		t.Helper()
		path, err := resolveConfigPath(file, app, exe)
		if err != nil { t.Fatal(err) }
		return path
	}
	if got, want := resolve(), filepath.Join(app, file); got != want {
		t.Fatalf("missing file: got %s want %s", got, want)
	}
	if err := os.WriteFile(filepath.Join(exe,file), []byte("{}"), 0600); err != nil { t.Fatal(err) }
	if got, want := resolve(), filepath.Join(exe,file); got != want {
		t.Fatalf("portable fallback: got %s want %s",got,want)
	}
	if err := os.WriteFile(filepath.Join(app,file), []byte("{}"), 0600); err != nil { t.Fatal(err) }
	if got, want := resolve(), filepath.Join(app,file); got != want {
		t.Fatalf("appdata precedence: got %s want %s",got,want)
	}
	if _,err := resolveConfigPath("../other.json",app,exe); err == nil {
		t.Fatal("expected unknown filename rejection")
	}
}

func TestResolvePreferencesPortable(t *testing.T) {
	root:=t.TempDir()
	app:=filepath.Join(root,"app")
	exe:=filepath.Join(root,"exe")
	if err:=os.MkdirAll(exe,0700);err!=nil {t.Fatal(err)}
	file:="preferences.json"
	if err:=os.WriteFile(filepath.Join(exe,file), []byte("{}"),0600);err!=nil {t.Fatal(err)}
	got,err:=resolveConfigPath(file,app,exe)
	if err!=nil {t.Fatal(err)}
	if got!=filepath.Join(exe,file) {t.Fatalf("unexpected path: %s",got)}
}
