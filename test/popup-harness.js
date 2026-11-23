// Uses the production popup and background in a disposable profile with synthetic cookies.
const report = { ok: false, checks: [] };
let youtube = false;
async function waitFor(predicate, name) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await predicate();
    if (result) { report.checks.push(name); return result; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${name}: ${document.querySelector("#status").textContent}`);
}
try {
  const prepare = document.querySelector("#prepare");
  const download = document.querySelector("#download");
  const close = document.querySelector("#close");
  await waitFor(() => !prepare.hidden && !prepare.disabled, "real Firefox private store is recognized");
  prepare.click();
  await waitFor(() => !download.hidden && download.href.startsWith("blob:moz-extension:"), "only an extension-owned Blob link is shown after the preparation button is pressed");
  await waitFor(() => !document.querySelector("#summary").hidden && /^쿠키 \d+개 · 세션 \d+개 · HttpOnly \d+개$/.test(document.querySelector("#summary").textContent), "only aggregate export metadata appears in the popup");
  report.filename = download.download;
  await waitFor(() => close.hidden, "no tab-close button appears before saving");
  download.click();
  const { host, tabId } = await browser.runtime.sendMessage({ action: "status" });
  youtube = host === "youtube.com";
  await waitFor(() => close.hidden !== youtube, "only the YouTube flow offers an explicit tab-close action");
  await waitFor(async () => {
    const entries = await browser.downloads.search({ query: [report.filename] });
    return entries.some(item => item.state === "complete");
  }, "the popup link produces a real completed Firefox download");
  await waitFor(async () => (await browser.tabs.get(tabId)).incognito, "the source tab stays open while saving");
  report.ok = true;
} catch (error) {
  report.error = String(error.message);
}
await browser.runtime.sendMessage({ action: "test-popup-report", report });
if (report.ok && youtube) document.querySelector("#close").click();
