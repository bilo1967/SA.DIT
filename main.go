package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// buildNumber is injected by GitHub Actions; local builds display "dev".
var buildNumber = "dev"

//go:embed frontend/*
var frontend embed.FS

func main() {
	content, err := fs.Sub(frontend, "frontend")
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name: "SA.DIT",
		Services: []application.Service{
			application.NewService(&ConfigService{}),
            application.NewService(&VoiceCommandsService{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(content),
		},
	})

	projection := &ProjectionService{app: app}
	app.RegisterService(application.NewService(projection))

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "main",
		Title: fmt.Sprintf("SA.DIT - build %s", buildNumber),
		Width: 1060,
		Height: 640,
		MinWidth: 880,
		MinHeight: 640,
		MaxHeight: 640,
	})
	window.Center()
	// Closing the main window ends the app even if the projection is still open.
	window.OnWindowEvent(events.Common.WindowClosing, func(event *application.WindowEvent) {
		app.Quit()
	})
	window.Show()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
