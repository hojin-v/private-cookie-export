// Copied into an isolated temporary extension by scripts/browser-test.js. Never packaged.
import { ExportController } from "./exporter.js";

const report = { ok: false, checks: [] };
function check(condition, name) { if (!condition) throw new Error(name); report.checks.push(name); }
try {
  let networkBlocked = false;
  try { await fetch("https://example.invalid/"); } catch { networkBlocked = true; }
  check(networkBlocked, "extension CSP blocks network fetch");
  const window = await browser.windows.create({ incognito: true, url: "https://www.youtube.com/robots.txt" });
  const tab = window.tabs[0];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { browser.tabs.onUpdated.removeListener(updated); reject(Error("test page timed out")); }, 20000);
    const done = () => { clearTimeout(timer); browser.tabs.onUpdated.removeListener(updated); resolve(); };
    const updated = (id, change) => { if (id === tab.id && change.status === "complete") done(); };
    browser.tabs.onUpdated.addListener(updated);
    browser.tabs.get(tab.id).then(current => { if (current.status === "complete") done(); });
  });
  check(await browser.extension.isAllowedIncognitoAccess(), "temporary test add-on can use private mode");
  // Synthetic values only; these are added AFTER navigation and cannot authenticate an account.
  for (const name of ["LOGIN_INFO", "SAPISID"]) {
    await browser.cookies.set({ url: "https://www.youtube.com/", domain: ".youtube.com", name,
      value: "TEST_ONLY_NOT_A_REAL_SESSION", path: "/", httpOnly: true, secure: true, storeId: tab.cookieStoreId });
  }
  const helper = new ExportController(browser);
  check((await helper.status()).phase === "ready", "real Firefox private store is recognized");
  const result = await helper.save(true);
  check(result.phase === "success", "real cookies API and blob download complete");
  check(result.closed === true, "only the source private tab closes after saving");
  check(!JSON.stringify(result).includes("TEST_ONLY"), "the public result contains no cookie values");
  const entries = await browser.downloads.search({ query: [result.filename] });
  check(entries.some(item => item.state === "complete" && !item.incognito), "download remains accessible after the private tab closes");
  report.filename = result.filename; report.ok = true;
} catch (error) {
  // These are fixed test check names or API failures in a profile with synthetic data only.
  report.error = String(error.message);
}
const blob = URL.createObjectURL(new Blob([JSON.stringify(report)], { type: "application/json" }));
await browser.downloads.download({ url: blob, filename: "rabbyt-helper-browser-report.json", saveAs: false, incognito: false });
