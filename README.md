# SA.DIT

**Sottotitolazione Attiva - DIT**

A lightweight desktop application for live interpreting and active subtitling.

## Concept

Two computers connect through WebRTC:

- **Interpreter / Project:** receives source audio (and optionally video) from the remote computer, and shares a selected application/window/screen (e.g. DragonPad).
- **Remote / Receive:** sends source audio (and optionally video), and displays the interpreter's shared video in an independent, compact, resizable desktop window above presentations or other content.

The application does not depend on a specific speech recognition engine. It transmits a visual source, not recognized text.

## Proposed stack

- Go + Wails 3 for Windows desktop windows and application lifecycle.
- JavaScript WebRTC inside the system WebView for media capture, transport and rendering.
- A small signaling/session service for short-lived PIN pairing; reuse an existing PeerJS signaling service if suitable.
- Existing STUN/TURN infrastructure for NAT traversal.

The stack is provisional until the WebView2 capture experiments are complete.

## First prototype: technical validation

1. Verify that Wails 3 / Windows WebView2 can capture a **specific application window** using `getDisplayMedia()`.
2. Verify that an independent, resizable, optionally always-on-top receiver window can show the stream with correct aspect ratio and readable text.
3. Verify that audio from the remote PC (particularly system/application audio) reaches the interpreter alongside the return video.

If any WebView2 capture limitations block these requirements, reconsider the capture mechanism before implementing the full application.

## Later steps

- PIN pairing with expiration, rate limiting and explicit acceptance.
- Session lifecycle, disconnect/reconnect, mute and source selection.
- Remember receiver window geometry, add borderless and optional click-through mode.
- Windows builds via GitHub Actions and testable releases.

## Status

Planning / initial technical validation. No working desktop application has been committed yet.
