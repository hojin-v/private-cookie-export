export const ROBOTS_URL = "https://www.youtube.com/robots.txt";
export const YOUTUBE_ORIGIN = "https://*.youtube.com/*";
export const PRIVATE_STORE = "firefox-private";
export const MAX_BYTES = 262144;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
export class HelperError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export const MESSAGES = Object.freeze({
  private_access: "Firefox의 이 확장 기능 설정에서 ‘사생활 보호 모드에서 실행’을 허용해 주세요.",
  host_access: "Firefox에서 현재 사이트 접근을 허용해 주세요.",
  private_tab: "HTTPS 사이트를 연 사생활 보호 탭에서 확장을 열어 주세요.",
  one_tab: "내보낼 사생활 보호 탭 한 개만 남겨 주세요.",
  changed: "현재 탭이나 페이지가 바뀌었습니다. 다시 시도해 주세요.",
  store: "현재 탭의 사생활 보호 쿠키 저장소를 확인할 수 없습니다.",
  empty: "이 페이지에 저장할 쿠키가 없습니다.",
  not_logged_in: "YouTube 로그인 정보가 확인되지 않습니다. 로그인과 추가 인증을 마친 뒤 다시 시도해 주세요.",
  invalid_cookie: "이 로그인 정보는 파일로 저장할 수 없습니다. 새 사생활 보호 탭에서 다시 로그인해 주세요.",
  too_large: "로그인 정보의 크기가 너무 큽니다. 새 사생활 보호 탭에서 다시 시도해 주세요.",
  navigate: "저장용 페이지를 열지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  busy: "이미 저장을 진행하고 있습니다. 잠시 기다려 주세요.",
  consent: "로그인 정보 파일 저장에 동의해 주세요.",
  internal: "도우미를 실행하지 못했습니다. 도우미를 닫았다가 다시 열어 주세요."
});
export function safeMessage(error) {
  return MESSAGES[error instanceof HelperError ? error.code : "internal"] || MESSAGES.internal;
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
  if (site.youtube) return host === site.host || host.endsWith(`.${site.host}`);
  if (host !== site.host && (cookie.hostOnly || !site.host.endsWith(`.${host}`))) return false;
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
export function exportFilename(date = new Date(), random = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `cookies-${stamp}-${random.toString(16).padStart(8, "0")}.txt`;
}
