export const tab = () => ({ id: 7, incognito: true, cookieStoreId: "firefox-private", url: "https://www.youtube.com/robots.txt", status: "complete" });
export const cookie = (name = "LOGIN_INFO", extra = {}) => ({ domain: ".youtube.com", path: "/", name, value: "TEST_ONLY_NOT_A_REAL_SESSION", storeId: "firefox-private", secure: true, httpOnly: true, hostOnly: false, session: true, firstPartyDomain: "", ...extra });
export const cookies = () => [cookie(), cookie("SAPISID")];
export class Event {
  listeners = new Set();
  addListener = listener => this.listeners.add(listener);
  removeListener = listener => this.listeners.delete(listener);
  emit = (...args) => { for (const listener of [...this.listeners]) listener(...args); };
}
export function fakeBrowser() {
  const calls = [], tabs = [tab()], data = cookies(), blobs = [], revoked = [];
  const api = {
    extension: { isAllowedIncognitoAccess: async () => true }, permissions: { contains: async () => true },
    tabs: {
      query: async query => query.active ? [tabs[0]] : tabs,
      get: async id => { const found = tabs.find(t => t.id === id); if (!found) throw Error("TEST_BACKEND_NOT_FOR_USERS"); return found; },
      update: async (id, info) => { calls.push(["navigate", id, info.url]); const t = await api.tabs.get(id); t.url = info.url; queueMicrotask(() => api.tabs.onUpdated.emit(id, { status: "complete" })); return t; },
      remove: async id => { calls.push(["close", id]); tabs.splice(tabs.findIndex(t => t.id === id), 1); },
      onUpdated: new Event(), onRemoved: new Event()
    },
    cookies: { getAll: async query => { calls.push(["cookies", query]); return data; } },
    downloads: {
      download: async options => { calls.push(["download", options]); return 42; },
      search: async query => { calls.push(["search", query]); return [{ id: 42, state: "complete" }]; },
      cancel: async id => { calls.push(["cancel", id]); }, onChanged: new Event()
    }
  };
  const urls = { createObjectURL: blob => { blobs.push(blob); return "blob:moz-extension://TEST_LOCAL_ONLY/export"; }, revokeObjectURL: url => revoked.push(url) };
  return { api, calls, tabs, data, blobs, revoked, urls };
}
