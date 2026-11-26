import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise real event handlers while replacing only the native Wails boundary.
async function setup({ toggle = [true, false, true], saveError = null } = {}) {
  const elements = Object.fromEntries(['openProjection', 'projectionButtonLabel', 'hideProjectionTitlebar']
    .map(id => [id, { disabled: false, checked: false, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } }]));
  const events = {}, calls = [], saved = [], failures = [];
  let shown = 0;
  globalThis.document = { getElementById: id => elements[id] };
  globalThis.__projectionMock = {
    Call: { ByName: async (name, ...args) => {
      calls.push([name, ...args]);
      if (name.endsWith('.Toggle')) return toggle.shift();
    } },
    Events: { On: (name, fn) => { events[name] = fn; } },
  };
  const source = (await readFile(new URL('../frontend/projection-window.js', import.meta.url), 'utf8'))
    .replace('import { Call, Events } from "/wails/runtime.js";', 'const Call = { ByName: (...args) => globalThis.__projectionMock.Call.ByName(...args) }; const Events = { On: (...args) => globalThis.__projectionMock.Events.On(...args) };');
  const { initProjectionWindow } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const controller = initProjectionWindow({
    onShown: () => { shown++; },
    savePreference: async value => { if (saveError) throw saveError; saved.push(value); },
    failure: (message, error) => failures.push([message, error]),
  });
  return { controller, elements, events, calls, saved, failures, shown: () => shown };
}

test('toggle shows, hides and reveals the same projection without resetting video', async () => {
  const ui = await setup();
  for (let i = 0; i < 3; i++) await ui.elements.openProjection.onclick();
  assert.deepEqual(ui.calls.map(call => call[0]), Array(3).fill('main.ProjectionService.Toggle'));
  assert.equal(ui.shown(), 2);
  assert.equal(ui.elements.projectionButtonLabel.textContent, 'Nascondi finestra di proiezione');
  assert.equal(ui.elements.openProjection.disabled, false);
  ui.events['sadit:projection:visibility']({ data: { visible: false } });
  assert.equal(ui.elements.projectionButtonLabel.textContent, 'Mostra finestra di proiezione');
  assert.equal(ui.elements.openProjection.attributes['aria-pressed'], 'false');
});

test('automatic video arrival opens rather than toggling an existing view off', async () => {
  const ui = await setup();
  await ui.controller.show();
  await ui.controller.show();
  assert.deepEqual(ui.calls.map(call => call[0]), Array(2).fill('main.ProjectionService.Open'));
  assert.equal(ui.shown(), 2);
});

test('titlebar preference is loaded and changes are saved', async () => {
  const ui = await setup();
  await ui.controller.applyPreference({ hideProjectionTitlebar: true });
  assert.equal(ui.elements.hideProjectionTitlebar.checked, true);
  assert.deepEqual(ui.calls[0], ['main.ProjectionService.SetTitlebarHidden', true]);
  assert.deepEqual(ui.saved, []);
  ui.elements.hideProjectionTitlebar.checked = false;
  await ui.elements.hideProjectionTitlebar.onchange();
  assert.deepEqual(ui.saved, [{ hideProjectionTitlebar: false }]);
  assert.deepEqual(ui.calls[1], ['main.ProjectionService.SetTitlebarHidden', false]);
});

test('a failed save restores both the checkbox and the native titlebar', async () => {
  const ui = await setup({ saveError: new Error('Cannot write preferences') });
  await ui.controller.applyPreference({});
  ui.elements.hideProjectionTitlebar.checked = true;
  await ui.elements.hideProjectionTitlebar.onchange();
  assert.equal(ui.elements.hideProjectionTitlebar.checked, false);
  assert.equal(ui.elements.hideProjectionTitlebar.disabled, false);
  assert.deepEqual(ui.calls.slice(-2), [['main.ProjectionService.SetTitlebarHidden', true],
    ['main.ProjectionService.SetTitlebarHidden', false]]);
  assert.equal(ui.failures.length, 1);
});
