// Local display crop: the received stream and the interpreter's capture stay intact.
import { Call } from "/wails/runtime.js";
import { videoLayout, dragSelection, normalizedCrop } from "./crop-geometry.mjs";

export function initProjectionCrop(video) {
  const stage = document.getElementById("stage");
  const overlay = document.getElementById("cropOverlay");
  const selectionBox = document.getElementById("cropSelection");
  const cropButton = document.getElementById("cropButton");
  const restoreButton = document.getElementById("restoreButton");
  const okButton = document.getElementById("cropOK");
  const cancelButton = document.getElementById("cropCancel");
  let crop = null, editing = false, selection = null, start = null, pointer = null, pending = false;
  let revision = 0, nativeTask = Promise.resolve();
  // Serialize native resizing so a session reset cannot race an in-flight crop.
  const resize = (method, ...args) => {
    nativeTask = nativeTask.catch(() => {}).then(() => Call.ByName("main.ProjectionService." + method, ...args));
    return nativeTask;
  };

  // Update video geometry on resize and when the source changes resolution.
  function render() {
    const frame = videoLayout(video.videoWidth, video.videoHeight, stage.clientWidth, stage.clientHeight, crop);
    if (frame) Object.assign(video.style, { left: `${frame.left}px`, top: `${frame.top}px`,
      width: `${frame.width}px`, height: `${frame.height}px` });
    cropButton.hidden = editing || !!crop;
    restoreButton.hidden = editing || !crop;
    okButton.hidden = cancelButton.hidden = !editing;
    cropButton.disabled = pending || !frame || !video.srcObject;
    restoreButton.disabled = pending;
    okButton.disabled = pending || !selection;
    cancelButton.disabled = pending;
    stage.classList.toggle("cropping", editing);
    overlay.hidden = !editing;
  }

  // Show the current selection; starting another drag replaces it.
  function drawSelection(rect) {
    selectionBox.hidden = !rect || rect.width < 4 || rect.height < 4;
    if (rect) Object.assign(selectionBox.style, { left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px` });
  }

  // Cancel pointer capture as well as the draft when leaving crop mode.
  function cancelSelection() {
    if (pointer !== null && overlay.hasPointerCapture(pointer)) overlay.releasePointerCapture(pointer);
    pointer = start = selection = null;
    editing = false;
    drawSelection(null);
    render();
  }

  cropButton.onclick = () => {
    if (pending || !video.videoWidth || !video.srcObject) return;
    editing = true;
    selection = null;
    drawSelection(null);
    render();
  };
  cancelButton.onclick = () => { if (!pending) cancelSelection(); };

  // Apply only on confirmation; a failed native resize leaves the draft editable.
  okButton.onclick = async () => {
    if (pending || !editing || !selection) return;
    const selected = selection;
    const currentRevision = revision;
    const width = Math.round(selected.width * video.videoWidth *
      Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight));
    const height = Math.round(selected.height * video.videoHeight *
      Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight));
    pending = true;
    render();
    try {
      await resize("ApplyCrop", width, height, stage.clientWidth, stage.clientHeight);
      if (revision !== currentRevision) return;
      crop = selected;
      cancelSelection();
    } catch (error) {
      console.error("Impossibile ridimensionare la proiezione:", error);
    } finally {
      pending = false;
      render();
    }
  };
  restoreButton.onclick = async () => {
    if (pending) return;
    pending = true;
    render();
    try {
      await resize("Restore");
      crop = null;
    } catch (error) {
      console.error("Impossibile ripristinare la proiezione:", error);
    } finally {
      pending = false;
      render();
    }
  };

  // Pointer capture keeps the selection usable when dragging outside the window.
  const point = event => {
    const bounds = stage.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  function updateSelection(event) {
    const frame = videoLayout(video.videoWidth, video.videoHeight, stage.clientWidth, stage.clientHeight);
    if (!frame) return;
    const rect = dragSelection(start, point(event), frame);
    selection = normalizedCrop(rect, frame);
    drawSelection(rect);
    render();
  }
  overlay.onpointerdown = event => {
    if (!editing || pending || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    start = point(event);
    overlay.setPointerCapture(pointer);
    updateSelection(event);
  };
  overlay.onpointermove = event => {
    if (event.pointerId === pointer) updateSelection(event);
  };
  overlay.onpointerup = event => {
    if (event.pointerId !== pointer) return;
    updateSelection(event);
    if (overlay.hasPointerCapture(pointer)) overlay.releasePointerCapture(pointer);
    pointer = start = null;
  };
  overlay.onpointercancel = () => { if (!pending) cancelSelection(); };
  window.addEventListener("keydown", event => {
    if (!editing || pending) return;
    if (event.key === "Escape") { event.preventDefault(); cancelSelection(); }
    if (event.key === "Enter" && selection) { event.preventDefault(); okButton.click(); }
  });
  window.addEventListener("resize", () => {
    if (editing && !pending) cancelSelection();
    else render();
  });
  video.addEventListener("loadedmetadata", render);
  video.addEventListener("resize", () => {
    if (editing && !pending) cancelSelection();
    else render();
  });
  render();

  // A different session starts with the complete source and original window size.
  return { reset() {
    const needsRestore = !!crop || pending;
    revision++;
    crop = null;
    cancelSelection();
    if (needsRestore) resize("Restore").catch(console.error);
  } };
}
