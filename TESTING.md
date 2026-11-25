# SA.DIT — Windows media prototype

This is a **technical prototype**, not a release. There is **one executable** for both roles.

## Download / build

On GitHub, open **Actions → Windows prototype → latest successful run → Artifacts** and download `SA.DIT-Windows-amd64-prototype`. Extract the ZIP and run `SA.DIT.exe` on Windows 11. WebView2 is required (normally installed on Windows 11).

If Actions has no successful build, run `go mod tidy` and `go build -tags production -o SA.DIT.exe .` on Windows with Go 1.26 or newer, or inspect the failing workflow log.

## Test on one PC (no PeerJS needed)

Run `SA.DIT.exe` **twice**. Arrange the two application windows side by side:

1. Instance A: choose **Proietta (interprete)**; click **Condividi finestra e crea offerta**; select an application window. Wait for the outgoing JSON to appear.
2. Copy the entire outgoing JSON from A into the **Segnalazione ricevuta** field in B.
3. Instance B: choose **Riceve (PC remoto)**, choose **Microfono**, then click **Applica offerta e crea risposta**. Allow microphone access. Wait for the answer JSON to appear.
4. Copy B's complete outgoing JSON into A's received signaling field.
5. On A click **Applica risposta**. ICE should establish the connection: A receives sound from B's mic, and B receives video from A's shared window.
6. On A click **Aggiorna dispositivi** and select a listening device; use **Riprendi audio** if autoplay was blocked.

**Important for a one-PC test:** use headphones or mute local speakers to avoid audio feedback. Do not capture the SA.DIT window itself (otherwise you will get a recursive video mirror). Two instances can each request capture; permissions and audio routing depend on WebView2.

## Test on two PCs

Perform the same steps on each machine and exchange the two JSON blocks via a trusted channel. This prototype uses a default public STUN server only. Connections across NATs/firewalls **are not guaranteed without TURN**. No PIN/signaling server is integrated yet; that is a planned next phase.

## Known limitations / intended checks

- Windows 11 / Wails 3 / WebView2 desktop screen-picker compatibility is **unverified** until a human runs the binary.
- System audio capture is experimental. Start with the microphone. In **Riceve**, you can select **Audio condiviso dello schermo** to check whether WebView2 offers a usable audio track.
- Interpreter-to-remote video and remote-to-interpreter audio must work **at the same time**.
- No automatic reconnection, PIN, chat, video source from room PC, compact always-on-top window, or automated integration tests yet.
- Output-device selection requires WebView2 support for `HTMLMediaElement.setSinkId()`; the default output is always available.
- SDP text can contain IP candidates. Only share it with the intended peer.
- This prototype uses GitHub Actions to **compile** a Windows executable, not to test a GUI, actual capture, or hardware devices. Those require hands-on Windows testing.

## Report useful test results

For each test, note: Windows version, whether the app launches, whether window selection works, whether B receives video, whether A receives audio, whether the audio output selector works, any error shown in the bottom log, and the GitHub Actions run URL.
