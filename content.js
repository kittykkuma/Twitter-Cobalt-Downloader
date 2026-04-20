const INJECTED_ATTR = "data-cobalt-injected";

// ── Styles ────────────────────────────────────────────────────────────────────
const STYLES = `
  .cobalt-dl-wrap {
    display: inline-flex;
    align-items: center;
  }
  .cobalt-dl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: rgb(113, 118, 123);
    border-radius: 9999px;
    width: 34px;
    height: 34px;
    padding: 0;
    transition: color 0.15s ease, background 0.15s ease;
    position: relative;
  }
  .cobalt-dl-btn:hover:not(:disabled) {
    color: #1d9bf0;
    background: rgba(29, 155, 240, 0.1);
  }
  .cobalt-dl-btn:disabled { cursor: default; }
  .cobalt-dl-btn svg { pointer-events: none; }
  .cobalt-dl-status {
    font-size: 13px;
    font-weight: 600;
    font-family: -apple-system, sans-serif;
  }
  @keyframes cobalt-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
  .cobalt-pulsing { animation: cobalt-pulse 0.9s ease infinite; }
`;

const DOWNLOAD_SVG = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 16.5l-6-6h4V4h4v6.5h4l-6 6zM5 20h14v-2H5v2z"/>
  </svg>`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTweetUrl(article) {
  // The <time> element lives inside the permalink <a>
  const time = article.querySelector("time");
  if (!time) return null;
  const anchor = time.closest("a");
  if (!anchor) return null;
  const href = anchor.getAttribute("href");
  if (!href || !href.includes("/status/")) return null;
  return `https://x.com${href}`;
}

function getActionBar(article) {
  // Find the action bar by locating any known action button inside it
  const reply = article.querySelector('[data-testid="reply"]');
  if (reply) return reply.closest('[role="group"]');
  // Fallback: last role=group in the article
  const groups = article.querySelectorAll('[role="group"]');
  return groups.length ? groups[groups.length - 1] : null;
}

// ── Button lifecycle ──────────────────────────────────────────────────────────
function setIcon(btn, html, pulsing = false) {
  btn.innerHTML = html;
  btn.classList.toggle("cobalt-pulsing", pulsing);
}

function resetBtn(btn) {
  btn.disabled = false;
  btn.classList.remove("cobalt-pulsing");
  btn.style.color = "";
  setIcon(btn, DOWNLOAD_SVG);
}

function createButton(tweetUrl) {
  const wrap = document.createElement("div");
  wrap.className = "cobalt-dl-wrap";

  const btn = document.createElement("button");
  btn.className = "cobalt-dl-btn";
  btn.setAttribute("aria-label", "Download with cobalt");
  btn.title = "Download with cobalt";
  setIcon(btn, DOWNLOAD_SVG);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    btn.disabled = true;
    setIcon(btn, `<span class="cobalt-dl-status cobalt-pulsing">…</span>`);

    chrome.runtime.sendMessage({ action: "download", url: tweetUrl }, (res) => {
      if (chrome.runtime.lastError) {
        showResult(btn, false, "ext error");
        return;
      }
      if (res?.success) {
        const label = res.count > 1 ? `${res.count}↓` : "✓";
        showResult(btn, true, label);
      } else {
        showResult(btn, false, res?.error ?? "error");
      }
    });
  });

  wrap.appendChild(btn);
  return wrap;
}

function showResult(btn, ok, label) {
  btn.classList.remove("cobalt-pulsing");
  btn.style.color = ok ? "#1d9bf0" : "#f4212e";
  setIcon(btn, `<span class="cobalt-dl-status" title="${label}">${label}</span>`);
  setTimeout(() => resetBtn(btn), ok ? 2500 : 3500);
}

// ── Injection ─────────────────────────────────────────────────────────────────
function injectButton(article) {
  if (article.hasAttribute(INJECTED_ATTR)) return;

  const url = getTweetUrl(article);
  if (!url) return;

  const bar = getActionBar(article);
  if (!bar) return;

  article.setAttribute(INJECTED_ATTR, "1");
  bar.appendChild(createButton(url));
}

function scanPage() {
  document.querySelectorAll("article").forEach(injectButton);
}

// ── Reinjection guard ─────────────────────────────────────────────────────────
// X sometimes re-renders articles (e.g. thread expansion). Remove the flag
// when an article is detached so it gets re-injected if it comes back.
function watchRemovals(mutations) {
  for (const m of mutations) {
    for (const node of m.removedNodes) {
      if (node.nodeType !== 1) continue;
      const articles = node.tagName === "ARTICLE" ? [node] : [...node.querySelectorAll("article")];
      articles.forEach((a) => a.removeAttribute(INJECTED_ATTR));
    }
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const styleEl = document.createElement("style");
styleEl.textContent = STYLES;
document.head.appendChild(styleEl);

scanPage();

const observer = new MutationObserver((mutations) => {
  watchRemovals(mutations);
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === "ARTICLE") injectButton(node);
      else node.querySelectorAll?.("article").forEach(injectButton);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
