package main

import (
	"fmt"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// ProjectionService manages a separate room-side display window.
type ProjectionService struct {
	app *application.App
	mu sync.Mutex
	cropped bool
	restoreWidth int
	restoreHeight int
	hideTitlebar bool
}

// Open creates or reveals the independent subtitle projection window.
func (s *ProjectionService) Open() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.openLocked()
}

// openLocked reveals the existing window without reloading its crop or video.
func (s *ProjectionService) openLocked() {
	if existing, ok := s.app.Window.GetByName("projection"); ok {
		existing.Show()
		existing.Focus()
		s.publishVisibility(true)
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
		// Transparent native surface; external/video mode remains opaque via CSS.
		BackgroundType: application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		Frameless: s.hideTitlebar,
	})
	// The system close button also hides; actual app shutdown must still close it.
	screen.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if s.app.Context().Err() != nil {
			return
		}
		event.Cancel()
		screen.Hide()
		s.publishVisibility(false)
	})
	screen.Center()
	screen.Show()
	s.publishVisibility(true)
}

// Toggle shows/hides the same projection window, keeping its stream and selection.
func (s *ProjectionService) Toggle() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if screen, ok := s.app.Window.GetByName("projection"); ok && screen.IsVisible() {
		screen.Hide()
		s.publishVisibility(false)
		return false
	}
	s.openLocked()
	return true
}

// publishVisibility keeps the main button in sync with native window actions.
func (s *ProjectionService) publishVisibility(visible bool) {
	s.app.Event.Emit("sadit:projection:visibility", map[string]bool{"visible": visible})
}

// SetTitlebarHidden changes the existing native frame without recreating the view.
func (s *ProjectionService) SetTitlebarHidden(hidden bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hideTitlebar = hidden
	if screen, ok := s.app.Window.GetByName("projection"); ok {
		// Wails' live SetFrameless changes native Windows styles. Reset the
		// transparent surface colour after the frame transition to restore alpha.
		screen.SetFrameless(hidden)
		screen.SetBackgroundColour(application.NewRGBA(0, 0, 0, 0))
		screen.ExecJS(fmt.Sprintf("document.documentElement.classList.toggle('frameless', %t)", hidden))
	}
}

// IsTitlebarHidden supplies the drag handle state when the projection page loads.
func (s *ProjectionService) IsTitlebarHidden() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hideTitlebar
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
