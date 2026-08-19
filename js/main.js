import { LlamaClient } from "./api.js";
import { initTokenizerScene } from "./scenes/tokenizer.js";
import { initNextTokenScene } from "./scenes/nexttoken.js";
import { initDocumentScene } from "./scenes/document.js";
import { initRotScene } from "./scenes/rot.js";

const client = new LlamaClient();

// ---- scene switching ----
const tabs = [...document.querySelectorAll(".tab")];
function showScene(name) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.scene === name));
  document.querySelectorAll(".scene").forEach((s) =>
    s.classList.toggle("active", s.id === "scene-" + name)
  );
}
tabs.forEach((t) => t.addEventListener("click", () => showScene(t.dataset.scene)));
const params = new URLSearchParams(location.search);
if (params.get("scene")) showScene(params.get("scene"));
addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  const idx = parseInt(e.key, 10) - 1;
  if (idx >= 0 && idx < tabs.length) showScene(tabs[idx].dataset.scene);
});

// ---- server status ----
const dot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const urlInput = document.getElementById("server-url");
const footModel = document.getElementById("foot-model");
urlInput.value = client.baseUrl;
urlInput.addEventListener("change", () => {
  client.setBaseUrl(urlInput.value);
  checkServer();
});

async function checkServer() {
  dot.className = "dot";
  statusText.textContent = "connecting…";
  try {
    const p = await client.props();
    dot.className = "dot ok";
    const slots = p.total_slots ?? "?";
    const nCtx = p.default_generation_settings?.n_ctx;
    statusText.textContent = `online · ${slots} slots · ${nCtx ? (nCtx / 1024) + "k ctx" : ""}`;
    const model = (p.model_path || "").split("/").pop();
    footModel.textContent = model;
  } catch (e) {
    dot.className = "dot err";
    statusText.textContent = "unreachable";
    console.error("server check failed:", e);
  }
}
checkServer();

// ---- scenes ----
initTokenizerScene(client);
initNextTokenScene(client);
initDocumentScene(client);
initRotScene(client);
