package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed frontend/*
var frontend embed.FS

func main() {
	content, err := fs.Sub(frontend, "frontend")
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name: "SA.DIT",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(content),
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "main",
		Title: "SA.DIT - Media validation",
		Width: 880,
		Height: 700,
		MinWidth: 520,
		MinHeight: 450,
	})
	window.Center()
	window.Show()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
