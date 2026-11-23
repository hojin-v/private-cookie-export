// Copied into an isolated temporary add-on by scripts/browser-test.js. Never packaged.
import "./background.js";

const report = { ok: false, checks: [] };
const generic = false;
function check(condition, name) {
  if (!condition) throw new Error(name);
  report.checks.push(name);
}

try {
  const probe = "https://example.invalid/";
  const violation = new Promise(resolve => {
    const timeout = setTimeout(() => { removeEventListener("securitypolicyviolation", record); resolve(false); }, 3000);
    function record(event) {
      if (event.effectiveDirective !== "connect-src" || event.disposition !== "enforce" || !event.blockedURI.startsWith(probe)) return;
      clearTimeout(timeout);
      removeEventListener("securitypolicyviolation", record);
      resolve(true);
    }
    addEventListener("securitypolicyviolation", record);
  });
  // A failed request alone could be a DNS error. Require a browser-generated enforcement event.
  void fetch(probe).catch(() => {});
  check(await violation, "Firefox reports enforced connect-src blocking of an extension fetch");
  const url = generic ? "https://example.com/" : "https://www.youtube.com/robots.txt?fixture=1";
  const window = await browser.windows.create({ incognito: true, url });
  const tab = window.tabs[0];
  await browser.windows.update(window.id, { focused: true });
  for (let attempt = 0; ; attempt++) {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    if (active?.id === tab.id && active.url === url && active.status === "complete") break;
    if (attempt === 149) throw new Error("The synthetic fixture tab did not finish loading");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  check(await browser.extension.isAllowedIncognitoAccess(), "temporary test add-on can use private mode");
  for (const name of generic ? ["FIXTURE_SESSION"] : ["LOGIN_INFO", "SAPISID"]) {
    await browser.cookies.set({ url, domain: generic ? ".example.com" : ".youtube.com", name,
      value: "TEST_ONLY_NOT_A_REAL_SESSION", path: "/", httpOnly: true, secure: true, storeId: "firefox-private" });
  }
  const excluded = { url, name: "FIXTURE_NORMAL_STORE", value: "FIXTURE_MUST_NOT_EXPORT", path: "/", storeId: "firefox-default" };
  check((await browser.cookies.set(excluded))?.storeId === "firefox-default", "the fixture adds a matching cookie to the normal store");
  const wrongPath = { ...excluded, url: new URL("/other", url).href, name: "FIXTURE_WRONG_PATH", path: "/other", storeId: "firefox-private" };
  check((await browser.cookies.set(wrongPath))?.path === "/other", "the fixture adds a cookie outside the export URL path");

  const popup = new Promise(resolve => {
    browser.runtime.onMessage.addListener(function finish(message, sender) {
      if (message?.action !== "test-popup-report" || sender.url !== browser.runtime.getURL("popup.html")) return;
      browser.runtime.onMessage.removeListener(finish);
      resolve(message.report);
    });
  });
  const tabClosed = generic ? null : new Promise(resolve => {
    browser.tabs.onRemoved.addListener(function removed(id) {
      if (id !== tab.id) return;
      browser.tabs.onRemoved.removeListener(removed);
      resolve(true);
    });
  });
  await browser.action.openPopup({ windowId: window.id });
  const result = await popup;
  if (!result.ok) throw new Error(result.error);
  report.checks.push(...result.checks);
  if (tabClosed) {
    const timedOut = new Promise(resolve => setTimeout(resolve, 5000, false));
    check(await Promise.race([tabClosed, timedOut]), "the explicit close button closes the same YouTube save tab");
  } else {
    check((await browser.tabs.get(tab.id)).incognito, "the generic site tab stays open");
  }
  report.filename = result.filename;
  report.locale = result.locale;
  report.ok = true;
} catch (error) {
  report.error = String(error.message);
}
const blob = URL.createObjectURL(new Blob([JSON.stringify(report)], { type: "application/json" }));
await browser.downloads.download({ url: blob, filename: "rabbyt-helper-browser-report.json", saveAs: false, incognito: false });
