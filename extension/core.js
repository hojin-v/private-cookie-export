export const ROBOTS_URL = "https://www.youtube.com/robots.txt";
export const MAX_BYTES = 262144;
export class HelperError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export const MESSAGES = Object.freeze({
  private_access: "Firefox의 이 확장 기능 설정에서 ‘사생활 보호 모드에서 실행’을 허용해 주세요.",
  host_access: "확장 기능 설정에서 YouTube 접근을 허용해 주세요.",
  private_tab: "YouTube에 로그인한 사생활 보호 탭에서 도우미를 열어 주세요.",
  one_tab: "다른 사생활 보호 탭을 닫고, YouTube 로그인용 탭 한 개만 남겨 주세요.",
  changed: "탭이 바뀌었습니다. 로그인한 YouTube 사생활 보호 탭에서 다시 시도해 주세요.",
  not_logged_in: "YouTube 로그인 정보가 확인되지 않습니다. 로그인과 추가 인증을 마친 뒤 다시 시도해 주세요.",
  invalid_cookie: "이 로그인 정보는 파일로 저장할 수 없습니다. 새 사생활 보호 탭에서 다시 로그인해 주세요.",
  too_large: "로그인 정보의 크기가 너무 큽니다. 새 사생활 보호 탭에서 다시 시도해 주세요.",
  navigate: "저장용 페이지를 열지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  download: "파일을 저장하지 못했습니다. 다운로드 설정과 저장 공간을 확인해 주세요. 로그인 탭은 닫지 않았습니다.",
  timeout: "저장이 완료됐는지 확인하지 못했습니다. Firefox 다운로드를 확인해 주세요. 중복 저장은 하지 않았습니다.",
  busy: "이미 저장을 진행하고 있습니다. 잠시 기다려 주세요.",
  consent: "파일 저장과 로그인 탭 닫기 안내를 확인해 주세요.",
  internal: "도우미를 실행하지 못했습니다. 도우미를 닫았다가 다시 열어 주세요."
});
export function safeMessage(error) {
  return MESSAGES[error instanceof HelperError ? error.code : "internal"] || MESSAGES.internal;
}
export function youtubeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && /^(?:[a-z0-9-]+\.)*youtube\.com$/.test(url.hostname) ? url : null;
  } catch { return null; }
}
export function isRobots(value) {
  const url = youtubeUrl(value);
  return url?.hostname === "www.youtube.com" && url.pathname === "/robots.txt" && !url.search && !url.hash;
}
export function validateTab(tab) {
  if (!tab?.incognito || !Number.isInteger(tab.id) || tab.cookieStoreId !== "firefox-private"
      || !youtubeUrl(tab.url)) throw new HelperError("private_tab");
  return tab;
}
export function assertSameTab(original, current, tabs, requireRobots = false) {
  validateTab(current);
  if (current.id !== original.id || current.cookieStoreId !== original.cookieStoreId
      || requireRobots && !isRobots(current.url)) throw new HelperError("changed");
  // No URL/title access is needed for other tabs; broad tabs permission is intentionally absent.
  const privateTabs = tabs.filter(tab => tab.incognito && tab.cookieStoreId === current.cookieStoreId);
  if (privateTabs.length !== 1 || privateTabs[0].id !== current.id) throw new HelperError("one_tab");
}
export function exportNetscape(input, storeId, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(input) || input.length > 1000) throw new HelperError("too_large");
  const cookies = new Map();
  for (const cookie of input) {
    const host = String(cookie.domain || "").replace(/^\./, "").toLowerCase();
    if (!/^(?:[a-z0-9-]+\.)*youtube\.com$/.test(host) || cookie.storeId !== storeId) continue;
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
    cookies.set(key, { row, name, value });
  }
  const names = new Set([...cookies.values()].filter(c => c.value).map(c => c.name));
  if (!names.has("LOGIN_INFO") || !["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"].some(n => names.has(n))) throw new HelperError("not_logged_in");
  const rows = [...cookies.entries()].sort(([a], [b]) => a.localeCompare(b, "en")).map(([, c]) => c.row);
  const text = "# Netscape HTTP Cookie File\n# RabbYT Login Helper — YouTube only. Keep this file private.\n" + rows.join("\n") + "\n";
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new HelperError("too_large");
  return text;
}
export function exportFilename(date = new Date(), random = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `RabbYT-youtube-login-${stamp}-${random.toString(16).padStart(8, "0")}.txt`;
}
