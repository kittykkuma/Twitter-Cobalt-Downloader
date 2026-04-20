function sanitizeFilename(name) {
  return (name || "download")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .slice(0, 200);
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ instance: "", apiKey: "" }, (v) => resolve(v));
  });
}

async function cobaltRequest(url) {
  const { instance, apiKey } = await getSettings();
  if (!instance) {
    throw new Error("instance not configured — open the extension popup");
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Api-Key ${apiKey}`;

  const res = await fetch(`${instance.replace(/\/+$/, "")}/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function dl(url, filename) {
  return chrome.downloads.download({
    url,
    filename: sanitizeFilename(filename),
    conflictAction: "uniquify",
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "download") return false;

  (async () => {
    try {
      const data = await cobaltRequest(msg.url);

      if (data.status === "error") {
        sendResponse({ success: false, error: data.error?.code ?? "unknown error" });
        return;
      }

      if (data.status === "tunnel" || data.status === "redirect") {
        await dl(data.url, data.filename);
        sendResponse({ success: true });
        return;
      }

      if (data.status === "picker") {
        const tweetId = msg.url.match(/\/status\/(\d+)/)?.[1] ?? Date.now();
        for (let i = 0; i < data.picker.length; i++) {
          const item = data.picker[i];
          const ext = item.type === "gif" ? "gif" : "mp4";
          await dl(item.url, `${tweetId}_${i + 1}.${ext}`);
        }
        if (data.audio) {
          await dl(data.audio, data.audioFilename ?? "audio.mp3");
        }
        sendResponse({ success: true, count: data.picker.length });
        return;
      }

      sendResponse({ success: false, error: `unsupported status: ${data.status}` });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // keep message channel open for async response
});
