// Main-window controls for native visibility and the optional projection titlebar.
import { Call, Events } from "/wails/runtime.js";

export function initProjectionWindow({ onShown, savePreference, failure }) {
  const button = document.getElementById("openProjection");
  const caption = document.getElementById("projectionButtonLabel");
  const checkbox = document.getElementById("hideProjectionTitlebar");
  let hiddenTitlebar = false;

  // Native close-to-hide actions update this label through the same event.
  function visibility(visible) {
    caption.textContent = visible ? "Nascondi finestra di proiezione" : "Mostra finestra di proiezione";
    button.setAttribute("aria-pressed", String(visible));
  }
  Events.On("sadit:projection:visibility", event => visibility(!!event.data?.visible));

  // User toggles preserve the local WebRTC connection and crop.
  button.onclick = async () => {
    button.disabled = true;
    try {
      const visible = await Call.ByName("main.ProjectionService.Toggle");
      visibility(visible);
      if (visible) onShown();
    } catch (error) {
      failure("Non riesco a mostrare o nascondere la proiezione.", error);
    } finally {
      button.disabled = false;
    }
  };

  // Roll back the checkbox/native frame together when persistence fails.
  checkbox.onchange = async () => {
    const next = checkbox.checked;
    checkbox.disabled = true;
    try {
      await Call.ByName("main.ProjectionService.SetTitlebarHidden", next);
      await savePreference({ hideProjectionTitlebar: next });
      hiddenTitlebar = next;
    } catch (error) {
      checkbox.checked = hiddenTitlebar;
      await Call.ByName("main.ProjectionService.SetTitlebarHidden", hiddenTitlebar).catch(console.error);
      failure("Non riesco a salvare la scelta della barra titolo.", error);
    } finally {
      checkbox.disabled = false;
    }
  };
  visibility(false);

  return {
    // Automatic opening on receipt of a video must never toggle an open view off.
    async show() {
      await Call.ByName("main.ProjectionService.Open");
      visibility(true);
      onShown();
    },
    // Apply saved preferences before the window is created, or to a live view.
    async applyPreference(preferences) {
      hiddenTitlebar = !!preferences.hideProjectionTitlebar;
      checkbox.checked = hiddenTitlebar;
      await Call.ByName("main.ProjectionService.SetTitlebarHidden", hiddenTitlebar);
    },
  };
}
