# SA.DIT

**Sottotitolazione Attiva — DIT**. An independent desktop application for remote live subtitling, named after the Romagnol expression *sa dit'?* ("what are you saying?").

## Roles

- **Interprete / Respeaker** shares an application window and receives the room's audio.
- **Sala** sends audio from its selected input (normally the room's audio system) and shows the interpreter's window in a separate, movable, resizable projection window.
- The main interface is a compact landscape desktop window. Both roles have connection controls, audio device selector, readable event log, chat and connection status.

## Connect

1. On the interpreter's PC select **Interprete**, then **Condividi finestra e ottieni PIN**. Select a window in the system picker.
2. When the six-digit PIN appears, tell it to the room operator.
3. On the room PC select **Sala**, choose the audio input, enter the PIN and click **Connettiti**.
4. The separate projection window opens when the interpreter's video arrives. **Apri finestra di proiezione** can also open it manually.
5. Both sides can exchange short messages through the chat panel.

No manual SDP exchange is required. PeerJS handles WebRTC signaling. The PIN is a temporary, guessable PeerJS peer identifier **only for prototype testing**; do not treat it as secure session authentication or use it for sensitive exams until pairing security is improved.

## Connection settings

Open **Setup** from the compact header. Network settings use `signaling.json`, device preferences use `preferences.json`. Config lookup checks `%APPDATA%\SA.DIT` first, then the directory of the executable. See [configuration documentation](docs/configuration.md).

By default the client uses the public `0.peerjs.com` server, Google STUN servers, and no TURN; your own PeerJS server and TURN servers can be configured with Setup.

## Building Windows

GitHub Actions workflow **Windows prototype** produces the portable `SA.DIT.exe` artifact. The build pins and embeds the PeerJS 1.5.5 browser bundle; therefore the finished app does not need a CDN at runtime.

To build from source locally, retrieve the matching PeerJS 1.5.5 file into `frontend/peerjs.min.js` before running `go build -tags production -o SA.DIT.exe .`. The project needs Go 1.26+ and Wails 3. For Windows, WebView2 is required.

## Status and limitations

This is a technical prototype. Windows WebView2 media capture and the separate projection window still require hands-on validation. The PeerJS public server does not guarantee availability; TURN is required on some networks. Pairing currently uses a six-digit public peer ID, so authentication, expiry, throttling and explicit acceptance need refinement before production use.

Audio is one way from Sala to Interprete; video travels from Interprete to Sala. The projection uses a second local WebRTC connection from the main room WebView to the display window.
