package main

import (
	"fmt"
	"sync"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// ProjectionService manages a separate room-side display window.
type ProjectionService struct {
	app *application.App
	mu sync.Mutex
	cropped bool
	restoreWidth int
	restoreHeight int
}

// Open creates or reveals the independent subtitle projection window.
func (s *ProjectionService) Open() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.app.Window.GetByName("projection"); ok {
		existing.Show()
		existing.Focus()
		return
	}
	s.cropped = false
	screen := s.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "projection",
		Title: fmt.Sprintf("SA.DIT - Proiezione (build %s)", buildNumber),
		URL: "http://wails.localhost/projection.html",
		Width: 960,
		Height: 240,
		MinWidth: 160,
		MinHeight: 60,
		AlwaysOnTop: false,
	})
	screen.Center()
	screen.Show()
}

// ApplyCrop keeps the original window size for Restore, then fits the selection.
func (s *ProjectionService) ApplyCrop(width, height, viewportWidth, viewportHeight int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if width < 1 || height < 1 || width > 16384 || height > 16384 || viewportWidth < 1 || viewportHeight < 1 {
		return fmt.Errorf("invalid crop size: %d x %d", width, height)
	}
	screen, ok := s.app.Window.GetByName("projection")
	if !ok {
		return fmt.Errorf("projection window is closed")
	}
	windowWidth, windowHeight := screen.Size()
	if !s.cropped {
		s.restoreWidth, s.restoreHeight = windowWidth, windowHeight
		s.cropped = true
	}
	// Wails sizes include the titlebar/borders; the selection uses content pixels.
	screen.SetSize(max(160, width+max(0, windowWidth-viewportWidth)),
		max(60, height+max(0, windowHeight-viewportHeight)))
	return nil
}

// Restore returns to the size that preceded the crop, keeping the window independent.
func (s *ProjectionService) Restore() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if screen, ok := s.app.Window.GetByName("projection"); ok && s.cropped {
		screen.SetSize(s.restoreWidth, s.restoreHeight)
	}
	s.cropped = false
}
