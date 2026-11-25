// SA.DIT settings: Wails config service -> two JSON files in the user config directory.
import { Call } from "/wails/runtime.js";

const $ = (id) => document.getElementById(id);
const invoke = (name, ...args) => Call.ByName("main.ConfigService." + name, ...args);
const clone = (value) => JSON.parse(JSON.stringify(value));
let signaling = null;
let preferences = null;

function addICE(server = { urls: "", username: "", credential: "" }) {
  const row = document.createElement("div");
  row.className = "row";
  const url = document.createElement("input");
  url.className = "ice-url";
  url.placeholder = "stun:host:3478 o turns:host:443";
  url.setAttribute("aria-label", "URL ICE");
  url.value = server.urls || "";
  const username = document.createElement("input");
  username.placeholder = "Username TURN";
  username.setAttribute("aria-label", "Username TURN");
  username.value = server.username || "";
  const credential = document.createElement("input");
  credential.type = "password";
  credential.autocomplete = "off";
  credential.placeholder = "Password TURN";
  credential.setAttribute("aria-label", "Password TURN");
  credential.value = server.credential || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Rimuovi";
  remove.addEventListener("click", () => row.remove());
  row.append(url, username, credential, remove);
  $("iceRows").append(row);
}

function readICE() {
  return [...$("iceRows").children].map((row) => ({
    urls: row.children[0].value.trim(),
    username: row.children[1].value,
    credential: row.children[2].value,
  }));
}

function setOptions(target, source, defaultLabel) {
  const previous = target.value;
  target.replaceChildren(new Option(defaultLabel, ""));
  for (const option of source.options) {
    if (option.value && option.value !== "default") {
      target.add(new Option(option.textContent, option.value));
    }
  }
  if ([...target.options].some((item) => item.value === previous)) target.value = previous;
}

function renderDialog() {
  $("peerHost").value = signaling.host;
  $("peerPort").value = signaling.port;
  $("peerPath").value = signaling.path;
  $("peerSecure").checked = signaling.secure;
  $("iceRows").replaceChildren();
  for (const server of signaling.iceServers || []) addICE(server);
  setOptions($("settingsInput"), $("inputDevice"), "Dispositivo predefinito");
  setOptions($("settingsOutput"), $("outputDevice"), "Dispositivo predefinito");
  $("settingsInput").value = preferences.inputDeviceId || "";
  $("settingsOutput").value = preferences.outputDeviceId || "";
  $("settingsError").textContent = "";
}

function applyPreferences() {
  if (preferences.role === "project" || preferences.role === "receive") {
    $("role").value = preferences.role;
    $("role").dispatchEvent(new Event("change"));
  }
  if (preferences.inputDeviceId) {
    const option = [...$("inputDevice").options].find((x) => x.value === preferences.inputDeviceId);
    if (option) $("inputDevice").value = option.value;
  }
  if (preferences.outputDeviceId) {
    const option = [...$("outputDevice").options].find((x) => x.value === preferences.outputDeviceId);
    if (option) $("outputDevice").value = option.value;
  }
}

async function openSettings() {
  try {
    signaling = await invoke("LoadSignaling");
    preferences = await invoke("LoadPreferences");
    await window.saditRefreshDevices?.();
    renderDialog();
    $("settingsDialog").showModal();
  } catch (error) {
    console.error(error);
    alert("Impossibile caricare le impostazioni: " + error.message);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const newSignaling = {
    host: $("peerHost").value.trim(),
    port: Number($("peerPort").value),
    path: $("peerPath").value.trim(),
    secure: $("peerSecure").checked,
    iceServers: readICE(),
  };
  const newPreferences = {
    role: $("role").value,
    inputDeviceId: $("settingsInput").value,
    outputDeviceId: $("settingsOutput").value,
  };
  try {
    await invoke("SaveSignaling", newSignaling);
    await invoke("SavePreferences", newPreferences);
    signaling = clone(newSignaling);
    preferences = clone(newPreferences);
    window.saditSignaling = clone(signaling);
    if (!window.saditConnected?.()) {
      $("inputDevice").value = preferences.inputDeviceId;
      $("outputDevice").value = preferences.outputDeviceId;
    }
    $("settingsDialog").close();
  } catch (error) {
    $("settingsError").textContent = "Salvataggio non riuscito: " + error.message;
  }
}

$("openSettings").addEventListener("click", openSettings);
$("cancelSettings").addEventListener("click", () => $("settingsDialog").close());
$("addICE").addEventListener("click", () => addICE());
$("settingsRefreshDevices").addEventListener("click", async () => {
  await window.saditRefreshDevices?.();
  setOptions($("settingsInput"), $("inputDevice"), "Dispositivo predefinito");
  setOptions($("settingsOutput"), $("outputDevice"), "Dispositivo predefinito");
});
$("settingsForm").addEventListener("submit", saveSettings);

// Initialize configuration before a user starts the WebRTC session.
try {
  signaling = await invoke("LoadSignaling");
  preferences = await invoke("LoadPreferences");
  window.saditSignaling = clone(signaling);
  await window.saditRefreshDevices?.();
  applyPreferences();
} catch (error) {
  $("openSettings").title = "Errore di configurazione: " + error.message;
  console.error("SA.DIT config:", error);
}
