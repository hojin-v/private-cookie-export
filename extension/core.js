export const ROBOTS_URL = "https://www.youtube.com/robots.txt";
export const YOUTUBE_ORIGIN = "https://www.youtube.com/*";
export const PRIVATE_STORE = "firefox-private";
export const MAX_BYTES = 262144;
export const COOKIE_FILENAME = "cookies.txt";
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
export class HelperError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function errorMessageKey(error) {
  return error instanceof HelperError ? `error_${error.code}` : "error_internal";
}
export function siteForUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !HOST.test(url.hostname)) return null;
    const youtube = url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com");
    return {
      url, youtube,
      host: youtube ? "youtube.com" : url.hostname,
      permission: youtube ? YOUTUBE_ORIGIN : `https://${url.hostname}/*`
    };
  } catch { return null; }
}
export function isRobots(value) {
  return value === ROBOTS_URL;
}
export function validateTab(tab) {
  if (tab?.incognito !== true || !Number.isInteger(tab.id) || tab.id < 0
      || !siteForUrl(tab.url)) throw new HelperError("private_tab");
}
export function assertPrivateStore(tab, stores) {
  if (!Array.isArray(stores)) throw new HelperError("store");
  const privateStores = stores.filter(store => store.id === PRIVATE_STORE);
  if (privateStores.length !== 1) throw new HelperError("store");
  const { tabIds } = privateStores[0];
  if (!Array.isArray(tabIds) || !tabIds.includes(tab.id)
      || stores.some(store => store.id !== PRIVATE_STORE && store.tabIds?.includes(tab.id))) {
    throw new HelperError("store");
  }
  if (tabIds.length !== 1) throw new HelperError("one_tab");
}
function appliesToSite(cookie, host, site) {
  if (!HOST.test(host)) return false;
  const pageHost = site.url.hostname;
  if (host !== pageHost && (cookie.hostOnly || !pageHost.endsWith(`.${host}`))) return false;
  const path = cookie.path;
  return typeof path === "string" && (site.url.pathname === path
    || site.url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`));
}

export function exportNetscape(input, site, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(input) || input.length > 1000) throw new HelperError("too_large");
  const cookies = new Map();
  for (const cookie of input) {
    const host = String(cookie.domain || "").replace(/^\./, "").toLowerCase();
    if (cookie.storeId !== PRIVATE_STORE || !appliesToSite(cookie, host, site)) continue;
    // Never merge unrelated top-level partitions or first-party-isolated stores.
    if (cookie.partitionKey?.topLevelSite || cookie.firstPartyDomain) continue;
    const { name, value, path } = cookie;
    if (typeof name !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
        || typeof value !== "string" || /[\x00-\x20\x7f;]/.test(value)
        || typeof path !== "string" || !path.startsWith("/") || /[\x00-\x20\x7f;]/.test(path)) throw new HelperError("invalid_cookie");
    const expires = cookie.session ? 0 : Math.floor(cookie.expirationDate);
    if (!cookie.session && (!Number.isSafeInteger(expires) || expires <= nowSeconds)) continue;
    const domain = (cookie.hostOnly ? "" : ".") + host;
    const row = [(cookie.httpOnly ? "#HttpOnly_" : "") + domain, cookie.hostOnly ? "FALSE" : "TRUE",
      path, cookie.secure ? "TRUE" : "FALSE", String(expires), name, value].join("\t");
    const key = `${domain}\t${path}\t${name}`;
    if (cookies.has(key) && cookies.get(key).row !== row) throw new HelperError("invalid_cookie");
    cookies.set(key, { row, name, value, session: cookie.session === true, httpOnly: cookie.httpOnly === true });
  }
  if (site.youtube) {
    const names = new Set([...cookies.values()].filter(c => c.value).map(c => c.name));
    if (!names.has("LOGIN_INFO") || !["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"].some(n => names.has(n))) throw new HelperError("not_logged_in");
  }
  if (!cookies.size) throw new HelperError("empty");
  const entries = [...cookies.entries()].sort(([a], [b]) => a.localeCompare(b, "en")).map(([, cookie]) => cookie);
  const text = "# Netscape HTTP Cookie File\n# Private Cookie Export. Keep this file private.\n" + entries.map(cookie => cookie.row).join("\n") + "\n";
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new HelperError("too_large");
  return { text, summary: {
    total: entries.length,
    session: entries.filter(cookie => cookie.session).length,
    httpOnly: entries.filter(cookie => cookie.httpOnly).length
  } };
}
