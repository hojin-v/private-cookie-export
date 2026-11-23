export const tab = () => ({ id: 7, incognito: true, url: "https://www.youtube.com/robots.txt", status: "complete" });
export const cookie = (name = "LOGIN_INFO", extra = {}) => ({ domain: ".youtube.com", path: "/", name, value: "TEST_ONLY_NOT_A_REAL_SESSION", storeId: "firefox-private", secure: true, httpOnly: true, hostOnly: false, session: true, firstPartyDomain: "", ...extra });
export const cookies = () => [cookie(), cookie("SAPISID")];

export function fakeBrowser() {
  const calls = [], tabs = [tab()], data = cookies();
  const stores = [{ id: "firefox-private", tabIds: [7] }, { id: "firefox-default", tabIds: [99] }];
  const api = {
    extension: { isAllowedIncognitoAccess: async () => true },
    permissions: { contains: async () => true },
    tabs: {
      query: async () => tabs,
      get: async id => tabs.find(tab => tab.id === id),
      update: async (id, info) => { calls.push(["navigate", id, info.url]); tabs[0].url = info.url; },
      remove: async id => { calls.push(["close", id]); tabs.splice(tabs.findIndex(tab => tab.id === id), 1); }
    },
    cookies: {
      getAllCookieStores: async () => stores,
      getAll: async query => { calls.push(["cookies", query]); return data; }
    }
  };
  return { api, calls, tabs, data, stores };
}
