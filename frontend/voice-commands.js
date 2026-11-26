// Editor for the standalone, portable voice-commands.json dictionary.
import { Call } from "/wails/runtime.js";
import { normalizeVoiceCommands } from "./voice-format.js";

const $ = id => document.getElementById(id);
const invoke = (name, value) => value === undefined
  ? Call.ByName("main.VoiceCommandsService." + name)
  : Call.ByName("main.VoiceCommandsService." + name, value);

function displayReplacement(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}
function parseReplacement(value) {
  return value.replace(/\\([\\nrt])/g, (_, symbol) =>
    symbol === "n" ? "\n" : symbol === "r" ? "\r" : symbol === "t" ? "\t" : "\\");
}

export async function initVoiceCommands({ log }) {
  let commands = normalizeVoiceCommands(await invoke("Load"));
  const dialog = $("voiceCommandsDialog");
  const rows = $("voiceCommandsRows");

  function addRow(item = {t: "", r: ""}) {
    const row = document.createElement("div");
    row.className = "voice-row";
    const trigger = document.createElement("input");
    trigger.type = "text";
    trigger.value = item.t;
    trigger.placeholder = "Espressione pronunciata";
    trigger.maxLength = 160;
    const replacement = document.createElement("input");
    replacement.type = "text";
    replacement.value = displayReplacement(item.r);
    replacement.placeholder = "Sostituzione";
    replacement.maxLength = 600;
    replacement.title = "Usa \\n per un ritorno a capo e \\n\\n per un paragrafo.";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "subtle";
    remove.textContent = "Elimina";
    remove.onclick = () => row.remove();
    row.append(trigger, replacement, remove);
    rows.append(row);
    return row;
  }

  function open() {
    rows.replaceChildren();
    for (const item of commands) addRow(item);
    $("voiceCommandsError").textContent = "";
    dialog.showModal();
  }
  function close() { dialog.close(); }
  $("openVoiceCommands").onclick = open;
  $("cancelVoiceCommands").onclick = close;
  $("cancelVoiceCommandsTop").onclick = close;
  $("addVoiceCommand").onclick = () => {
    const row = addRow();
    row.scrollIntoView({block: "nearest"});
    row.firstElementChild.focus();
  };
  $("voiceCommandsForm").onsubmit = async event => {
    event.preventDefault();
    try {
      const next = [...rows.children].map(row => ({
        t: row.children[0].value.trim(),
        r: parseReplacement(row.children[1].value),
      }));
      if (next.some(command => !command.t)) throw new Error("Completa le espressioni oppure elimina le righe vuote.");
      if (next.length > 300) throw new Error("Massimo 300 comandi.");
      await invoke("Save", next);
      commands = normalizeVoiceCommands(next);
      close();
      log("Comandi vocali salvati.", String(commands.length) + " voci");
    } catch (error) {
      $("voiceCommandsError").textContent = String(error.message || error);
    }
  };
  return { get: () => commands.map(item => ({...item})) };
}
