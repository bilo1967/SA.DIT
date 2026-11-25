// Editable connection and per-PC preferences for SA.DIT.
import { Call } from "/wails/runtime.js";

const $ = (id) => document.getElementById(id);
const invoke = (method, value) =>
  value === undefined ? Call.ByName("main.ConfigService." + method) : Call.ByName("main.ConfigService." + method, value);

let signaling;
let preferences;
let app;

function addICE(item = {}) {
  const row = document.createElement("div");
  row.className = "ice-row";
  for (const [name, label, type] of [
    ["urls", "stun: oppure turn:", "text"],
    ["username", "Username TURN", "text"],
    ["credential", "Password TURN", "password"],
  ]) {
    const input = document.createElement("input");
    input.className = name === "urls" ? "ice-url" : "";
    input.type = type;
    input.autocomplete = "off";
    input.placeholder = label;
    input.setAttribute("aria-label", label);
    input.value = item[name] || "";
    input.dataset.field = name;
    row.append(input);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Rimuovi";
  remove.onclick = () => row.remove();
  row.append(remove);
  $("iceRows").append(row);
}

function selectedICE() {
  return [...$("iceRows").children].map(row => {
    const result = {};
    row.querySelectorAll("input").forEach(input => result[input.dataset.field] = input.value.trim());
    return result;
  });
}

async function savePrefs(partial) {
  preferences = { ...preferences, ...partial };
  await invoke("SavePreferences", preferences);
}

function showSettings() {
  $("peerHost").value = signaling.host;
  $("peerPort").value = signaling.port;
  $("peerPath").value = signaling.path;
  $("peerSecure").checked = signaling.secure;
  $("iceRows").replaceChildren();
  for (const server of signaling.iceServers || []) addICE(server);
  updateDeviceOptions();
  $("settingsError").textContent = "";
  $("settingsDialog").showModal();
}

function updateDeviceOptions() {
  const select = $("settingsDevice");
  const current = app.getRole() === "room" ? preferences.inputDeviceId : preferences.outputDeviceId;
  select.replaceChildren(...[...$("deviceSelect").options].map(o => new Option(o.textContent, o.value)));
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

async function saveDialog(event) {
  event.preventDefault();
  try {
    const next = {
      host: $("peerHost").value.trim(),
      port: Number($("peerPort").value),
      path: $("peerPath").value.trim(),
      secure: $("peerSecure").checked,
      iceServers: selectedICE(),
    };
    await invoke("SaveSignaling", next);
    signaling = next;
    app.setSignaling(signaling);
    const chosenDevice = $("settingsDevice").value;
    await savePrefs(app.getRole() === "room" ? {inputDeviceId:chosenDevice} : {outputDeviceId:chosenDevice});
    app.chooseDevice(chosenDevice);
    $("settingsDialog").close();
    app.log("Impostazioni salvate. Le impostazioni di rete valgono dalla prossima connessione.");
  } catch (err) {
    $("settingsError").textContent = "Non riesco a salvare le impostazioni: " + String(err.message || err);
  }
}

export async function initSettings(interfaceAPI) {
  app = interfaceAPI;
  signaling = await invoke("LoadSignaling");
  preferences = await invoke("LoadPreferences");
  app.setSignaling(signaling);
  app.setPreferences(preferences);
  $("openSettings").addEventListener("click", showSettings);
  $("cancelSettings").addEventListener("click", () => $("settingsDialog").close());
  $("closeSettings").addEventListener("click", () => $("settingsDialog").close());
  $("addICE").addEventListener("click", () => addICE());
  $("settingsRefreshDevices").addEventListener("click", async () => { await app.refreshDevices(); updateDeviceOptions(); });
  $("settingsForm").addEventListener("submit", saveDialog);
  return { savePrefs, getPreferences: () => preferences };
}
