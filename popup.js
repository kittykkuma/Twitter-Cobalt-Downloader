const instanceInput = document.getElementById("instance");
const apikeyInput = document.getElementById("apikey");
const statusEl = document.getElementById("status");
const form = document.getElementById("settings");

function normalizeInstance(value) {
  return value.trim().replace(/\/+$/, "");
}

function showStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

chrome.storage.sync.get({ instance: "", apiKey: "" }, (stored) => {
  instanceInput.value = stored.instance ?? "";
  apikeyInput.value = stored.apiKey ?? "";
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const instance = normalizeInstance(instanceInput.value);
  const apiKey = apikeyInput.value.trim();

  if (!instance) {
    showStatus("Instance URL is required.", "err");
    return;
  }

  try {
    const u = new URL(instance);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      showStatus("Instance must be an http(s) URL.", "err");
      return;
    }
  } catch {
    showStatus("Invalid URL.", "err");
    return;
  }

  chrome.storage.sync.set({ instance, apiKey }, () => {
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    instanceInput.value = instance;
    showStatus("Saved.", "ok");
  });
});
