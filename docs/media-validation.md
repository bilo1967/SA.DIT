# SA.DIT — First media validation

Target: Windows 11. One desktop executable, with **Project** (interpreter) and **Receive** (remote room PC) modes.

## Essential data flows

```text
Room PC (Receive)  -- audio (required) -->  Interpreter PC (Project)
Room PC (Receive)  -- video (optional) -->  Interpreter PC (Project)
Interpreter PC     -- shared window video --> Room PC
```

A connection is functional only if audio travels to the interpreter **while** the selected window's video travels back to the remote PC. Speech recognition, subtitle text parsing, and chat are not part of the initial prototype.

## MVP controls

**Project / interpreter**
- Start session, eventually obtain short-lived invitation PIN.
- Select a window, application, or screen to capture via the OS picker.
- Receive and play audio from the room PC.
- Choose the listening device (headphones/speakers) if `HTMLMediaElement.setSinkId()` works; otherwise use default system output and display the limitation clearly.
- Optionally show remote video and indicate connected/disconnected state.

**Receive / room PC**
- Join a session by PIN (later phase).
- Select an audio source: microphone first; system/application audio subject to capture availability in WebView2.
- Optionally send camera video.
- Display incoming shared window video in a compact, resizable, optionally always-on-top desktop window.
- Preserve the video's aspect ratio and keep text legible; provide a manual size override rather than relying only on stream resolution.

## Sequence of experiments

1. On one Windows machine, run a Wails 3 app and call `navigator.mediaDevices.getDisplayMedia({video:true})` on user interaction. Confirm window picker, captured frames, track ended handling, and WebView2 permissions.
2. Run WebRTC between two instances and confirm interpreter-to-room video, readability and stable sizing of the receiver window.
3. Send room-to-interpreter microphone audio and confirm playback; enumerate `audiooutput` devices and test `HTMLMediaElement.setSinkId`.
4. Test room-to-interpreter **system/application audio**, not merely microphone audio. Identify whether WebView2's screen-capture picker offers it. If unsupported, investigate a native Windows WASAPI loopback source before promising the feature.
5. Test both media directions simultaneously, mute/disconnect/reconnect, cancellation, and device removal.
6. Only after these tests pass, add PIN-based signaling using an existing signaling service and STUN/TURN configuration.

## Acceptance tests

| ID | Test | Pass condition |
|---|---|---|
| V1 | Window capture | A selected third-party window can be shared without capturing the entire screen. |
| V2 | Video reception | A second PC renders the shared content legibly in a resizable window. |
| A1 | Audio reception | Interpreter hears the room PC with acceptably low latency. |
| A2 | Output selection | Interpreter can choose a playback device, or is explicitly told when WebView2 disallows it. |
| A3 | System audio | Audio played on the room PC can be transmitted without requiring a physical microphone. |
| B1 | Simultaneous directions | Audio room → interpreter and video interpreter → room work at the same time. |
| L1 | Lifecycle | Stop sharing, hang up, and device loss produce a clean and recoverable UI. |

## Technical and privacy notes

- Windows 11 + WebView2 are the initial platform. Go/Wails 3 is provisional until screen/audio capture and device routing are validated.
- WebRTC is encrypted in transit; TURN may relay traffic. No recordings are planned.
- Source selection must be explicit; a PIN must not silently grant capture access.
- Never put permanent TURN credentials or signaling secrets inside client JavaScript or a public repository. Use short-lived credentials or an appropriately secured configuration.
- Numeric PINs require server-side expiry, throttling, and one-time pairing; do not use a six-digit PIN as the sole long-lived PeerJS identity.
- Chat is deferred until both audio and video pathways work reliably.
