import { YOUTUBE_ORIGIN, MAX_BYTES, COOKIE_FILENAME, HelperError, errorMessageKey } from "./core.js";
import { message } from "./i18n.js";

const status = document.querySelector("#status");
const scope = document.querySelector("#scope");
const summary = document.querySelector("#summary");
const prepare = document.querySelector("#prepare");
const download = document.querySelector("#download");
const close = document.querySelector("#close");
const revoke = document.querySelector("#revoke");
let current;
let busy = false;
let prepared;
let closeTabId;
let expiryTimer;

function show(feedback) {
  status.textContent = feedback;
  const ready = current?.phase === "ready";
  scope.hidden = !ready;
  scope.textContent = ready && current.permission === YOUTUBE_ORIGIN
    ? message("scopeYouTube")
    : message("scopePage");
  prepare.hidden = !ready || Boolean(prepared);
  prepare.disabled = busy;
  prepare.textContent = current?.allowed ? message("prepare") : message("preparePermission");
  summary.hidden = !prepared;
  if (prepared) {
    const { total, session, httpOnly } = prepared.summary;
    summary.textContent = message("cookieCounts", [total, session, httpOnly].map(String));
  } else {
    summary.textContent = "";
  }
  download.hidden = !prepared;
  close.hidden = closeTabId === undefined;
  close.disabled = busy;
  revoke.hidden = !current?.allowed;
  revoke.disabled = busy;
}

function discardFile() {
  if (!prepared) return;
  URL.revokeObjectURL(prepared.url);
  download.removeAttribute("href");
  download.removeAttribute("download");
  clearTimeout(expiryTimer);
  prepared = undefined;
}

async function refresh() {
  try { current = await browser.runtime.sendMessage({ action: "status" }); }
  catch (error) { current = { phase: "blocked", messageKey: errorMessageKey(error) }; }
  show(current.phase === "ready" ? message("privateTabStatus", current.host) : message(current.messageKey));
}

prepare.addEventListener("click", async () => {
  if (busy || prepared || current?.phase !== "ready") return;
  const { tabId, permission } = current;
  closeTabId = undefined;
  busy = true;
  show(message("preparing"));
  let feedback;
  try {
    if (!current.allowed) {
      current.allowed = await browser.permissions.request({ origins: [permission] });
      if (!current.allowed) throw new HelperError("host_access");
    }
    const result = await browser.runtime.sendMessage({ action: "prepare", consent: true, tabId, permission });
    if (result.phase !== "prepared") {
      feedback = message(result.messageKey);
    } else {
      const counts = result.summary;
      if (result.tabId !== tabId || !(result.file instanceof Blob) || result.file.size < 1 || result.file.size > MAX_BYTES
          || !Number.isInteger(counts?.total) || counts.total < 1
          || ![counts.session, counts.httpOnly].every(count => Number.isInteger(count) && count >= 0 && count <= counts.total)) throw new Error();
      prepared = { url: URL.createObjectURL(result.file), expiresAt: Date.now() + 60000, summary: counts };
      download.href = prepared.url;
      download.download = COOKIE_FILENAME;
      expiryTimer = setTimeout(() => {
        discardFile();
        show(message("expired"));
      }, 60000);
      feedback = message("prepared");
    }
  } catch (error) {
    feedback = message(errorMessageKey(error));
  } finally {
    busy = false;
    show(feedback);
  }
});

revoke.addEventListener("click", async () => {
  if (busy || !current?.allowed) return;
  busy = true;
  discardFile();
  closeTabId = undefined;
  show(message("revoking"));
  try {
    const origins = [current.permission];
    if (current.permission === YOUTUBE_ORIGIN) origins.push("https://*.youtube.com/*");
    await browser.permissions.remove({ origins });
    await refresh();
  } catch (error) { show(message(errorMessageKey(error))); }
  finally { busy = false; prepare.disabled = false; revoke.disabled = false; }
});

download.addEventListener("click", event => {
  if (!prepared || Date.now() >= prepared.expiresAt) {
    event.preventDefault();
    discardFile();
    show(message("expired"));
    return;
  }
  prepared.started = true;
  if (current.permission === YOUTUBE_ORIGIN) closeTabId = current.tabId;
  show(closeTabId === undefined ? message("checkDownloads") : message("checkDownloadsYouTube"));
});

close.addEventListener("click", async () => {
  if (busy || closeTabId === undefined) return;
  busy = true;
  show(message("closingYouTube"));
  let feedback;
  try {
    const result = await browser.runtime.sendMessage({ action: "close-youtube", tabId: closeTabId, permission: YOUTUBE_ORIGIN });
    feedback = message(result.messageKey);
    if (result.phase === "closed") {
      closeTabId = undefined;
      discardFile();
      current = { phase: "closed" };
    }
  } catch (error) { feedback = message(errorMessageKey(error)); }
  finally { busy = false; show(feedback); }
});

void refresh();
window.addEventListener("pagehide", () => {
  clearTimeout(expiryTimer);
  if (!prepared?.started) discardFile();
}, { once: true });
