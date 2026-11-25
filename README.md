# SA.DIT

**Sottotitolazione Attiva — DIT** is a portable desktop application for remote live subtitling and respeaking. Its name also recalls the Romagnol expression *sa dit'?* (“what are you saying?”).

An interpreter/respeaker shares the window containing live captions with a remote room, while listening to the room's audio. The room projects the captions in a separate, freely positionable window. Both operators can exchange chat messages.

**Current status:** functional Windows prototype, not yet a production-ready authenticated conferencing service. Development is on [`prototype/media-validation`](https://github.com/bilo1967/SA.DIT/tree/prototype/media-validation); the default `main` branch does not yet contain this implementation.

## How it works

At startup, choose one of two roles:

- **Interprete (respeaker):** captures and transmits a chosen application window, receives the room's audio on a selected playback device, and generates the six-digit connection PIN.
- **Sala (room):** enters the interpreter's PIN, sends audio from a selected input (for example, a room audio mixer), and projects the incoming video in a separate window.

Audio travels **Sala → Interprete**; shared-window video travels **Interprete → Sala**. Text chat works in both directions.

The desktop UI has a fixed-height, landscape layout: 60% for connection controls, device selection, status and logs; 40% for chat. The visible log contains essential messages; **Copia** copies the full log, including hidden WebRTC diagnostics. Each role has its own interface and device selector.

### Connecting

1. Launch `SA.DIT.exe` on both Windows PCs and choose the respective roles.
2. On **Interprete**, select **Condividi finestra e ottieni PIN**, then choose the application window to share.
3. Communicate the displayed PIN to the operator in **Sala**.
4. On **Sala**, select the appropriate audio input, enter the PIN and click **Connettiti**.
5. Use the chat and audio/video links. Confirm **Disconnettiti** to end a session; the application stops its capture tracks when disconnected.

PeerJS handles WebRTC signaling, so there is no manual SDP exchange. The room reserves a video media section in its offer so the interpreter's video can be negotiated alongside the room's audio. The interpreter's screen capture is configured for text legibility, targeting **15 fps** rather than smooth motion; actual resolution and bitrate remain dependent on WebRTC, network conditions and the browser engine.

## Projection window

The room's projection is a **separate, non-modal window**. Minimizing the main window leaves projection active; closing the main application terminates both windows.

- **Mostra/Nascondi** toggles the projection window without recreating the connection or losing its current size, position or crop. Closing the projection window using its **X** hides it instead of ending the session.
- Hover over projection to show the toolbar. Select **Crop**, drag to define a rectangular area, and adjust the selection if needed. **OK** (or Enter) applies the crop; **Cancel** (or Esc) cancels. **Restore** returns to the full image and the previous window dimensions.
- Cropping takes place **locally in Sala**, not at the interpreter: the source video is left unchanged. The crop accounts for letterboxing and remains aligned as the window is resized. A new session starts with the full image.
- The **Nascondi barra titolo finestra di proiezione** checkbox removes the native frame. In frameless mode, hover to reveal a four-arrow drag handle. This preference is saved locally.

The remote video is transferred to the room's separate display via a second, local WebRTC connection; only its signaling is exchanged between Wails windows.

## Setup and portable configuration

**Setup** opens a fixed-height dialog with audio device selection, PeerJS signaling options and an independently scrollable list of STUN/TURN servers. Save and Cancel remain accessible at the bottom.

SA.DIT uses two JSON files:

| File | Purpose |
| --- | --- |
| `signaling.json` | PeerJS host, port, path, TLS and STUN/TURN server settings; may be shared across PCs. |
| `preferences.json` | Local role, audio input/output IDs and the projection titlebar preference. |

For **each file**, lookup order is:

1. `%APPDATA%\SA.DIT\`
2. The directory containing `SA.DIT.exe` (portable fallback)

If both copies exist, the AppData copy wins. Existing files are saved back to their original location; new files are created in AppData. To deploy a self-contained configuration, distribute the JSON files beside the executable **before** saving settings in the app.

Default signaling uses `0.peerjs.com:443` over TLS, two Google STUN servers and **no TURN**. You can configure your own PeerJS/STUN/TURN infrastructure.

**Security:** TURN usernames and passwords in `signaling.json` are stored as plaintext. Never commit actual credentials or an operational shared TURN secret. Treat a preconfigured ZIP as sensitive for as long as its credentials remain valid.

## Windows build and tests

The [Windows prototype workflow](.github/workflows/windows-prototype.yml) builds a portable `SA.DIT.exe`, embeds the GitHub Actions run number in the window captions, runs Go tests and executes **nine JavaScript tests** covering projection cropping, window visibility and preferences. Download the executable from the latest successful workflow run's `SA.DIT-Windows-amd64-prototype` artifact.

Requirements for building from source: **Go 1.26**, **Wails v3.1.0**, Node.js (for the JavaScript tests) and the Windows toolchain/WebView2 runtime. The application uses WebView2 on Windows.

A simplified local Go build, after preparing the Wails bindings, is:

```powershell
go build -tags production -o SA.DIT.exe .
```

Windows icon resources are generated with `go-winres make --arch amd64` from `winres/winres.json` and `winres/icon.png` before compiling. Run `go install github.com/tc-hib/go-winres@v0.3.3` once when building locally; the GitHub Actions workflow installs it automatically.

The browser PeerJS client (pinned to version **1.5.5**) is currently loaded from jsDelivr when the app starts. The portable EXE therefore still needs network access to that CDN; bundling the client is future work.

For regression checks, see [TESTING.md](TESTING.md). Successful CI builds do not replace live checks of microphone access, window capture and screen projection on the target PCs.

## Security and planned work

**Current PINs are pairing identifiers, not authentication credentials.** They are six-digit PeerJS peer IDs and should not be relied upon to protect sensitive sessions. PeerJS signaling and ICE server configuration alone do not restrict use of a TURN relay.

Temporary TURN credentials are **planned, not implemented**:

- **Conference deployment:** distribute a preconfigured ZIP containing temporary TURN credentials created shortly before the event, expiring after the conference day with a small margin.
- **Routine use:** an authenticated HTTPS endpoint, potentially using university-wide authentication, issues credentials valid for approximately one week.
- Keep the coturn shared secret **only on the server**. Clients receive short-lived credentials, not that secret.
- Add limits for connection count, bandwidth and credential issuance rate. Expiry limits when a client can authenticate; its effect on already established TURN allocations needs separate handling.

Other planned or exploratory work:

- **macOS port (not started):** Wails supports Intel and Apple Silicon, but microphone/output-device behavior, WebRTC and especially `getDisplayMedia()` under WKWebView require validation. ScreenCaptureKit-based native capture may be needed for the interpreter role.
- **Application icon:** the provided projector-and-speech-bubble SVG appears in the shared title bar. A matching Windows EXE icon is embedded by `go-winres` during the Windows build.
- Bundle PeerJS locally and harden session authentication/acceptance before wider deployment.

The project is still evolving on the prototype branch; check the latest successful Windows build before deploying to a classroom or conference.
