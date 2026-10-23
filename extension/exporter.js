import { ROBOTS_URL, HelperError, safeMessage, validateTab, assertSameTab, isRobots, exportNetscape, exportFilename } from "./core.js";

export class ExportController {
  constructor(api, { urls = URL, now = () => new Date(), navigationTimeout = 15000, downloadTimeout = 60000 } = {}) {
    this.api = api; this.urls = urls; this.now = now;
    this.navigationTimeout = navigationTimeout; this.downloadTimeout = downloadTimeout;
    this.running = false; this.state = { phase: "idle", message: "" };
  }
  async context(original = null, robots = false) {
    if (!await this.api.extension.isAllowedIncognitoAccess()) throw new HelperError("private_access");
    if (!await this.api.permissions.contains({ origins: ["https://*.youtube.com/*"] })) throw new HelperError("host_access");
    const tab = original ? await this.api.tabs.get(original.id) : (await this.api.tabs.query({ active: true, currentWindow: true }))[0];
    validateTab(tab);
    assertSameTab(original || tab, tab, await this.api.tabs.query({}), robots);
    return tab;
  }
  async status() {
    if (this.running || this.state.phase === "success") return { ...this.state };
    try { await this.context(); return { phase: "ready", message: this.state.phase === "error" ? this.state.message : "이 YouTube 사생활 보호 탭의 로그인 정보를 저장합니다." }; }
    catch (error) { return { phase: "blocked", code: error instanceof HelperError ? error.code : "internal", message: safeMessage(error) }; }
  }
  progress(message) { this.state = { phase: "working", message }; }
  async save(consent) {
    if (this.running) return { phase: "error", message: safeMessage(new HelperError("busy")) };
    if (consent !== true) return { phase: "error", message: safeMessage(new HelperError("consent")) };
    this.running = true;
    let objectUrl = "", text = "", cookies = [];
    try {
      this.progress("로그인 탭을 확인하고 있습니다.");
      const tab = await this.context();
      if (!isRobots(tab.url)) { this.progress("저장용 페이지로 이동하고 있습니다."); await this.navigate(tab); }
      await this.context(tab, true);
      this.progress("YouTube 로그인 정보를 기기에 저장하고 있습니다.");
      // Never omit storeId and never use null firstPartyDomain or wildcard partitionKey.
      cookies = await this.api.cookies.getAll({ domain: "youtube.com", storeId: tab.cookieStoreId, firstPartyDomain: "" });
      await this.context(tab, true);
      text = exportNetscape(cookies, tab.cookieStoreId, Math.floor(this.now().getTime() / 1000));
      objectUrl = this.urls.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      text = ""; cookies = [];
      const filename = exportFilename(this.now());
      await this.download(objectUrl, filename);
      // Close only the same, still-isolated private tab after the browser confirms completion.
      let closed = false;
      try { await this.context(tab, true); await this.api.tabs.remove(tab.id); closed = true; } catch { /* Never close a changed or unrelated tab. */ }
      this.state = { phase: "success", filename, closed, message: closed
        ? "파일 저장을 완료하고 로그인 탭을 닫았습니다. RabbYT에서 파일을 가져온 뒤 원본을 삭제해 주세요."
        : "파일을 저장했습니다. 남아 있는 사생활 보호 탭을 직접 닫고 RabbYT에서 가져온 뒤 원본을 삭제해 주세요." };
    } catch (error) {
      this.state = { phase: "error", message: safeMessage(error) };
    } finally {
      if (objectUrl) this.urls.revokeObjectURL(objectUrl);
      text = ""; cookies = []; this.running = false;
    }
    return { ...this.state };
  }
  async navigate(tab) {
    const api = this.api;
    await new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); api.tabs.onUpdated.removeListener(updated); api.tabs.onRemoved.removeListener(removed); };
      const finish = error => { cleanup(); error ? reject(error) : resolve(); };
      const updated = (id, change) => {
        if (id !== tab.id) return;
        if (change.url && !isRobots(change.url)) { finish(new HelperError("changed")); return; }
        if (change.status === "complete") {
          api.tabs.get(id).then(current => {
            if (!isRobots(current.url) || !current.incognito || current.cookieStoreId !== tab.cookieStoreId) finish(new HelperError("changed"));
            else finish();
          }, () => finish(new HelperError("navigate")));
        }
      };
      const removed = id => { if (id === tab.id) finish(new HelperError("changed")); };
      api.tabs.onUpdated.addListener(updated); api.tabs.onRemoved.addListener(removed);
      timer = setTimeout(() => finish(new HelperError("navigate")), this.navigationTimeout);
      api.tabs.update(tab.id, { url: ROBOTS_URL }).catch(() => finish(new HelperError("navigate")));
    });
  }
  async download(url, filename) {
    let id;
    try { id = await this.api.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false, incognito: false }); }
    catch { throw new HelperError("download"); }
    if (!Number.isInteger(id)) throw new HelperError("download");
    await new Promise((resolve, reject) => {
      let finished = false, timer;
      const end = error => {
        if (finished) return; finished = true; clearTimeout(timer); this.api.downloads.onChanged.removeListener(changed);
        error ? reject(error) : resolve();
      };
      const changed = delta => {
        if (delta.id !== id) return;
        if (delta.state?.current === "complete") end();
        else if (delta.state?.current === "interrupted" || delta.error?.current) end(new HelperError("download"));
      };
      this.api.downloads.onChanged.addListener(changed);
      timer = setTimeout(async () => {
        // Cancel only our own unfinished download before revoking its in-memory URL.
        try { await this.api.downloads.cancel(id); } catch { /* It may have completed concurrently. */ }
        end(new HelperError("timeout"));
      }, this.downloadTimeout);
      // Completion can race with download() resolving; inspect only this exact download ID.
      this.api.downloads.search({ id }).then(items => {
        const item = items.find(item => item.id === id);
        if (item?.state === "complete") end();
        else if (item?.state === "interrupted") end(new HelperError("download"));
      }, () => { /* Keep waiting for this download's event or timeout; do not revoke an active blob. */ });
    });
  }
}
