import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { videoLayout, dragSelection, normalizedCrop } from '../frontend/crop-geometry.mjs';

// The pure geometry must agree with the visible image, including letterboxing.
test('letterboxing is excluded from the selected source coordinates', () => {
  const frame = videoLayout(1920, 1080, 960, 240);
  assert.equal(frame.height, 240);
  assert.ok(Math.abs(frame.left - 266.6666666667) < 0.0001);
  const rect = dragSelection({ x: 0, y: 0 }, { x: 960, y: 240 }, frame);
  const crop = normalizedCrop(rect, frame);
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 0);
  assert.ok(Math.abs(crop.width - 1) < 1e-12);
  assert.equal(crop.height, 1);
});

test('reverse dragging and out-of-window endpoints are clamped', () => {
  const frame = videoLayout(100, 100, 200, 200);
  assert.deepEqual(dragSelection({ x: 150, y: 180 }, { x: -20, y: 60 }, frame),
    { left: 0, top: 60, width: 150, height: 120 });
  assert.equal(normalizedCrop({ left: 0, top: 0, width: 0, height: 60 }, frame), null);
});

test('a crop displays only the selected area after resizing', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 };
  const result = videoLayout(1920, 1080, 960, 270, crop);
  assert.deepEqual(result, { left: -192, top: -216, width: 1920, height: 1080 });
  const resized = videoLayout(1920, 1080, 480, 135, crop);
  assert.deepEqual(resized, { left: -96, top: -108, width: 960, height: 540 });
  assert.equal(videoLayout(0, 1080, 960, 240), null);
});

// Exercise actual UI handlers with a tiny DOM and mocked native resizing.
async function setupUI(callOverride) {
  class Element {
    constructor() { this.style = {}; this.hidden = false; this.listeners = {}; this.captured = new Set();
      this.classList = { toggle() {} }; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    click() { if (!this.disabled) return this.onclick?.(); }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
  }
  const ids = ['stage', 'cropOverlay', 'cropSelection', 'cropButton', 'restoreButton', 'cropOK', 'cropCancel'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const stage = elements.stage;
  stage.clientWidth = 960; stage.clientHeight = 540;
  const video = new Element();
  Object.assign(video, { videoWidth: 1920, videoHeight: 1080, srcObject: {} });
  globalThis.document = { getElementById: id => elements[id] };
  globalThis.window = new Element();
  const calls = [];
  globalThis.__cropNativeCall = async (name, ...args) => {
    calls.push([name, ...args]);
    if (callOverride) await callOverride(name, ...args);
  };
  const source = (await readFile(new URL('../frontend/projection-crop.js', import.meta.url), 'utf8'))
    .replace('import { Call } from "/wails/runtime.js";', 'const Call = { ByName: (...args) => globalThis.__cropNativeCall(...args) };')
    .replace('"./crop-geometry.mjs"', JSON.stringify(new URL('../frontend/crop-geometry.mjs', import.meta.url).href));
  const { initProjectionCrop } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const controller = initProjectionCrop(video);
  const event = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault() {} });
  const drag = (x1, y1, x2, y2) => {
    elements.cropOverlay.onpointerdown(event(x1, y1));
    elements.cropOverlay.onpointermove(event(x2, y2));
    elements.cropOverlay.onpointerup(event(x2, y2));
  };
  return { elements, video, calls, drag, controller, stage };
}

test('selection can be redrawn, cancelled, confirmed and restored', async () => {
  const { elements: e, calls, drag, stage, video } = await setupUI();
  e.cropButton.click();
  drag(10, 20, 100, 120);
  drag(96, 54, 480, 270);
  assert.equal(e.cropOK.disabled, false);
  assert.equal(calls.length, 0); // Selecting does not resize or commit.
  e.cropCancel.click();
  assert.equal(e.cropOverlay.hidden, true);
  assert.equal(calls.length, 0);
  e.cropButton.click();
  drag(96, 54, 480, 270);
  await e.cropOK.click();
  assert.deepEqual(calls[0], ['main.ProjectionService.ApplyCrop', 384, 216, 960, 540]);
  assert.equal(e.restoreButton.hidden, false);
  assert.equal(e.cropButton.hidden, true);
  stage.clientWidth = 384; stage.clientHeight = 216;
  window.listeners.resize();
  assert.equal(video.style.left, '-96px');
  assert.equal(video.style.top, '-54px');
  await e.restoreButton.click();
  assert.equal(calls[1][0], 'main.ProjectionService.Restore');
  assert.equal(e.cropButton.hidden, false);
});

test('a session reset cannot reapply an in-flight crop', async () => {
  let unblock;
  const { elements: e, calls, drag, controller } = await setupUI(name => {
    if (name.endsWith('ApplyCrop')) return new Promise(resolve => { unblock = resolve; });
  });
  e.cropButton.click();
  drag(100, 100, 400, 300);
  const applying = e.cropOK.click();
  await new Promise(resolve => setImmediate(resolve));
  controller.reset();
  unblock();
  await applying;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call[0]), ['main.ProjectionService.ApplyCrop', 'main.ProjectionService.Restore']);
  assert.equal(e.restoreButton.hidden, true);
  assert.equal(e.cropButton.hidden, false);
});
