import { ROBOTS_URL, PRIVATE_STORE, HelperError, safeMessage, siteForUrl, validateTab, assertPrivateStore, isRobots, exportNetscape, exportFilename } from "./core.js";

export class ExportController {
  constructor(api, navigationTimeout = 15000) {
    this.api = api;
    this.navigationTimeout = navigationTimeout;
    this.running = false;
  }

  async context(tabId, permission) {
    if (!await this.api.extension.isAllowedIncognitoAccess()) throw new HelperError("private_access");
    const stores = await this.api.cookies.getAllCookieStores();
    const tabs = await this.api.tabs.query({ active: true, currentWindow: true });
    const active = tabs.length === 1 ? tabs[0] : null;
    if (tabId !== undefined && active?.id !== tabId) throw new HelperError("changed");
    const tab = tabId === undefined ? active : await this.api.tabs.get(tabId);
    validateTab(tab);
    const site = siteForUrl(tab.url);
    if (tabId !== undefined && (tab.id !== tabId || !active.incognito || site.permission !== permission)) throw new HelperError("changed");
    assertPrivateStore(tab, stores);
    return { tab, site };
  }

  async status() {
    try {
      const { tab, site } = await this.context();
      const allowed = await this.api.permissions.contains({ origins: [site.permission] });
      return { phase: "ready", tabId: tab.id, host: site.host, permission: site.permission, allowed };
    } catch (error) {
      return { phase: "blocked", message: safeMessage(error) };
    }
  }

  async settleYouTubePage(tab) {
    const { id, url, status } = tab;
    if (isRobots(url) && status === "complete") return;
    const deadline = performance.now() + this.navigationTimeout;
    if (!isRobots(url)) {
      try { await this.api.tabs.update(id, { url: ROBOTS_URL }); }
      catch { throw new HelperError("navigate"); }
    }
    while (performance.now() < deadline) {
      const current = await this.api.tabs.get(id);
      if (!current?.incognito || current.id !== id) throw new HelperError("changed");
      // Firefox Android can report a blank or hidden URL while the same tab commits the new page.
      const transitioning = !current.url || current.url === "about:blank";
      if (!transitioning && current.url !== url && !isRobots(current.url)) throw new HelperError("changed");
      if (isRobots(current.url) && current.status === "complete") return;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new HelperError("navigate");
  }

  async closeYouTubeTab(tabId, permission) {
    try {
      if (!Number.isInteger(tabId)) throw new HelperError("changed");
      const { tab, site } = await this.context(tabId, permission);
      if (!site.youtube || !isRobots(tab.url)) throw new HelperError("changed");
      await this.api.tabs.remove(tab.id);
      return { phase: "closed", message: "YouTube 사생활 보호 탭을 닫았습니다." };
    } catch (error) {
      return { phase: "error", message: safeMessage(error) };
    }
  }

  async prepare(consent, tabId, permission) {
    if (consent !== true || !Number.isInteger(tabId)) return { phase: "error", message: safeMessage(new HelperError("consent")) };
    if (this.running) return { phase: "error", message: safeMessage(new HelperError("busy")) };
    this.running = true;
    try {
      if (typeof permission !== "string") throw new HelperError("host_access");
      const { tab, site } = await this.context(tabId, permission);
      const origins = [site.permission];
      if (!await this.api.permissions.contains({ origins })) throw new HelperError("host_access");
      if (site.youtube) await this.settleYouTubePage(tab);
      const expectedUrl = site.youtube ? ROBOTS_URL : tab.url;
      const before = await this.context(tabId, permission);
      if (before.tab.url !== expectedUrl || (site.youtube && before.tab.status !== "complete")) throw new HelperError("changed");
      const scope = site.youtube ? { domain: site.host } : { url: site.url.href };
      const cookies = await this.api.cookies.getAll({ ...scope, storeId: PRIVATE_STORE, firstPartyDomain: "" });
      const after = await this.context(tabId, permission);
      if (after.tab.url !== expectedUrl || (site.youtube && after.tab.status !== "complete")
          || !await this.api.permissions.contains({ origins })) throw new HelperError("changed");
      const { text, summary } = exportNetscape(cookies, site);
      const file = new Blob([text], { type: "text/plain;charset=utf-8" });
      return { phase: "prepared", file, filename: exportFilename(), tabId, summary };
    } catch (error) {
      return { phase: "error", message: safeMessage(error) };
    } finally {
      this.running = false;
    }
  }
}
