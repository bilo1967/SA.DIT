package main

import (
    "fmt"
    "github.com/wailsapp/wails/v3/pkg/application"
)

// ProjectionService manages a separate room-side display window.
type ProjectionService struct { app *application.App }

// Open creates or reveals the independent subtitle projection window.
func (s *ProjectionService) Open() {
    if existing, ok := s.app.Window.GetByName("projection"); ok {
        existing.Show()
        existing.Focus()
        return
    }
    screen := s.app.Window.NewWithOptions(application.WebviewWindowOptions{
        Name: "projection",
        Title: fmt.Sprintf("SA.DIT - Proiezione (build %s)", buildNumber),
        URL: "http://wails.localhost/projection.html",
        Width: 960,
        Height: 240,
        MinWidth: 360,
        MinHeight: 120,
        AlwaysOnTop: false,
    })
    screen.Center()
    screen.Show()
}
