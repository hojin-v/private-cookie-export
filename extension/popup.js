import { YOUTUBE_ORIGIN, MAX_BYTES, HelperError, safeMessage } from "./core.js";

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

function show(message) {
  status.textContent = message;
  const ready = current?.phase === "ready";
  scope.hidden = !ready;
  scope.textContent = ready && current.permission === YOUTUBE_ORIGIN
    ? "youtube.com과 하위 도메인 · 저장용 페이지로 이동합니다."
    : "현재 HTTPS 페이지 · 이 주소에 적용되는 쿠키만 포함합니다.";
  prepare.hidden = !ready || Boolean(prepared);
  prepare.disabled = busy;
  prepare.textContent = current?.allowed ? "쿠키 파일 준비" : "사이트 권한 승인 후 준비";
  summary.hidden = !prepared;
  if (prepared) {
    const { total, session, httpOnly } = prepared.summary;
    summary.textContent = `쿠키 ${total}개 · 세션 ${session}개 · HttpOnly ${httpOnly}개`;
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
  catch (error) { current = { phase: "blocked", message: safeMessage(error) }; }
  show(current.phase === "ready" ? `${current.host} · 사생활 보호 탭` : current.message);
}

prepare.addEventListener("click", async () => {
  if (busy || prepared || current?.phase !== "ready") return;
  const { tabId, permission } = current;
  closeTabId = undefined;
  busy = true;
  show("쿠키 파일을 준비하고 있습니다…");
  let message;
  try {
    if (!current.allowed) {
      current.allowed = await browser.permissions.request({ origins: [permission] });
      if (!current.allowed) throw new HelperError("host_access");
    }
    const result = await browser.runtime.sendMessage({ action: "prepare", consent: true, tabId, permission });
    if (result.phase !== "prepared") {
      message = result.message;
    } else {
      const counts = result.summary;
      if (result.tabId !== tabId || !(result.file instanceof Blob) || result.file.size < 1 || result.file.size > MAX_BYTES
          || !/^cookies-\d{8}T\d{6}Z-[0-9a-f]{8}\.txt$/.test(result.filename)
          || !Number.isInteger(counts?.total) || counts.total < 1
          || ![counts.session, counts.httpOnly].every(count => Number.isInteger(count) && count >= 0 && count <= counts.total)) throw new Error();
      prepared = { url: URL.createObjectURL(result.file), expiresAt: Date.now() + 60000, summary: counts };
      download.href = prepared.url;
      download.download = result.filename;
      expiryTimer = setTimeout(() => {
        discardFile();
        show("저장 링크가 만료됐습니다. 다시 준비해 주세요.");
      }, 60000);
      message = "쿠키 파일을 준비했습니다.";
    }
  } catch (error) {
    message = safeMessage(error);
  } finally {
    busy = false;
    show(message);
  }
});

revoke.addEventListener("click", async () => {
  if (busy || !current?.allowed) return;
  busy = true;
  discardFile();
  closeTabId = undefined;
  show("이 사이트의 권한을 해제하고 있습니다…");
  try {
    await browser.permissions.remove({ origins: [current.permission] });
    await refresh();
  } catch (error) { show(safeMessage(error)); }
  finally { busy = false; prepare.disabled = false; revoke.disabled = false; }
});

download.addEventListener("click", event => {
  if (!prepared || Date.now() >= prepared.expiresAt) {
    event.preventDefault();
    discardFile();
    show("저장 링크가 만료됐습니다. 다시 준비해 주세요.");
    return;
  }
  prepared.started = true;
  if (current.permission === YOUTUBE_ORIGIN) closeTabId = current.tabId;
  show(closeTabId === undefined ? "Firefox 다운로드에서 저장을 확인하세요." : "저장이 끝났는지 Firefox에서 확인하세요.");
});

close.addEventListener("click", async () => {
  if (busy || closeTabId === undefined) return;
  busy = true;
  show("YouTube 사생활 보호 탭을 닫고 있습니다…");
  let message;
  try {
    const result = await browser.runtime.sendMessage({ action: "close-youtube", tabId: closeTabId, permission: YOUTUBE_ORIGIN });
    message = result.message;
    if (result.phase === "closed") {
      closeTabId = undefined;
      discardFile();
      current = { phase: "closed" };
    }
  } catch (error) { message = safeMessage(error); }
  finally { busy = false; show(message); }
});

void refresh();
window.addEventListener("pagehide", () => {
  clearTimeout(expiryTimer);
  if (!prepared?.started) discardFile();
}, { once: true });
