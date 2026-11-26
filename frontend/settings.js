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

function headphonesIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="13" width="4" height="8" rx="2"/><rect x="17" y="13" width="4" height="8" rx="2"/></svg>';
}

async function updateDeviceOptions() {
  const interpreter = app.getRole() === "interpreter";
  $("settingsAudioLegend").textContent = interpreter ? "Dispositivi audio" : "Dispositivo audio";
  $("settingsDeviceLabel").innerHTML = interpreter ? headphonesIcon() + "Cuffie" : "Dispositivo preferito";
  $("settingsMicrophoneRow").classList.toggle("hidden", !interpreter);
  const select = $("settingsDevice");
  const current = interpreter ? preferences.outputDeviceId : preferences.inputDeviceId;
  select.replaceChildren(...[...$("deviceSelect").options].map(o => new Option(o.textContent, o.value)));
  select.value = [...select.options].some(o=>o.value===current) ? current : "";
  if (interpreter) {
    const mic = $("settingsMicrophone");
    const saved = preferences.interpreterMicrophoneId || "";
    mic.replaceChildren(new Option("Predefinito", ""));
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const device of devices.filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default"))
        mic.add(new Option(device.label || "Microfono " + mic.length, device.deviceId));
    } catch (error) {
      app.log("Impossibile elencare i microfoni.", error.message);
    }
    if (saved && ![...mic.options].some(o=>o.value===saved))
      mic.add(new Option("Microfono precedentemente selezionato", saved));
    mic.value = saved;
  }
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
    await savePrefs(app.getRole() === "room" ? {inputDeviceId:chosenDevice} : {
      outputDeviceId:chosenDevice,
      interpreterMicrophoneId:$("settingsMicrophone").value,
    });
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
  $("addICE").addEventListener("click", () => {
    addICE();
    const rows = $("iceRows");
    rows.scrollTop = rows.scrollHeight;
    rows.lastElementChild.querySelector("input").focus();
  });
  $("settingsRefreshDevices").addEventListener("click", async () => { await app.refreshDevices(); await updateDeviceOptions(); });
  $("settingsForm").addEventListener("submit", saveDialog);
  return { savePrefs, getPreferences: () => preferences };
}
