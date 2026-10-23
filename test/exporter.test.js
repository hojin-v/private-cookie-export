import { test } from "node:test";
import assert from "node:assert/strict";
import { ExportController } from "../extension/exporter.js";
import { ROBOTS_URL } from "../extension/core.js";
import { fakeBrowser } from "./fixtures.js";

test("opening status or omitting consent never reads cookies or starts downloads", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api, f);
  assert.equal((await helper.status()).phase, "ready"); assert.equal((await helper.save(false)).phase, "error"); assert.deepEqual(f.calls, []);
});
test("success only exports the current private YouTube store and closes after confirmed completion", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api, f);
  const result = await helper.save(true); assert.equal(result.phase, "success"); assert.equal(result.closed, true);
  assert.deepEqual(f.calls[0], ["cookies", { domain: "youtube.com", storeId: "firefox-private", firstPartyDomain: "" }]);
  assert.equal(f.blobs.length, 1); assert.ok((await f.blobs[0].text()).startsWith("# Netscape HTTP Cookie File"));
  assert.deepEqual(f.calls.map(c => c[0]), ["cookies", "download", "search", "close"]);
  assert.ok(f.calls[1][1].url.startsWith("blob:")); assert.equal(f.calls[1][1].incognito, false); assert.equal(f.revoked.length, 1);
  assert.ok(!JSON.stringify(result).includes("TEST_ONLY_NOT_A_REAL_SESSION")); assert.equal(f.api.downloads.onChanged.listeners.size, 0);
});
test("the helper moves the same tab to robots.txt before reading any cookies", async () => {
  const f = fakeBrowser(); f.tabs[0].url = "https://m.youtube.com/watch?v=TEST";
  const result = await new ExportController(f.api, f).save(true); assert.equal(result.phase, "success");
  assert.deepEqual(f.calls[0], ["navigate", 7, ROBOTS_URL]); assert.equal(f.calls[1][0], "cookies");
  assert.equal(f.api.tabs.onUpdated.listeners.size, 0); assert.equal(f.api.tabs.onRemoved.listeners.size, 0);
});
test("ordinary stores, revoked access and multiple private tabs are blocked before reading", async () => {
  for (const change of [f => { f.tabs[0].incognito = false; }, f => { f.tabs[0].cookieStoreId = "firefox-default"; }, f => { f.api.extension.isAllowedIncognitoAccess = async () => false; }, f => { f.api.permissions.contains = async () => false; }, f => { f.tabs.push({ ...f.tabs[0], id: 9 }); }]) {
    const f = fakeBrowser(); change(f); assert.equal((await new ExportController(f.api, f).save(true)).phase, "error"); assert.deepEqual(f.calls, []);
  }
});
test("changed tabs after the asynchronous read cannot be downloaded or closed", async () => {
  const f = fakeBrowser(), original = f.api.cookies.getAll;
  f.api.cookies.getAll = async query => { const result = await original(query); f.tabs[0].url = "https://accounts.google.com/"; return result; };
  assert.equal((await new ExportController(f.api, f).save(true)).phase, "error"); assert.deepEqual(f.calls.map(c => c[0]), ["cookies"]);
});
test("a cancelled download leaves the login tab open and releases its memory URL", async () => {
  const f = fakeBrowser(); f.api.downloads.search = async () => [{ id: 42, state: "interrupted" }];
  const result = await new ExportController(f.api, f).save(true); assert.equal(result.phase, "error");
  assert.ok(!f.calls.some(c => c[0] === "close")); assert.equal(f.revoked.length, 1); assert.equal(f.api.downloads.onChanged.listeners.size, 0);
});
test("only this export's completion event can close the tab and concurrent exports are refused", async () => {
  const f = fakeBrowser(); f.api.downloads.search = async () => [{ id: 42, state: "in_progress" }];
  const helper = new ExportController(f.api, f), running = helper.save(true);
  await new Promise(resolve => setImmediate(resolve)); assert.equal((await helper.save(true)).phase, "error");
  f.api.downloads.onChanged.emit({ id: 99, state: { current: "complete" } }); assert.ok(!f.calls.some(c => c[0] === "close"));
  f.api.downloads.onChanged.emit({ id: 42, state: { current: "complete" } }); assert.equal((await running).closed, true);
});
test("a stalled export cancels only its own download and does not close the tab", async () => {
  const f = fakeBrowser(); f.api.downloads.search = async () => [{ id: 42, state: "in_progress" }];
  const result = await new ExportController(f.api, { ...f, downloadTimeout: 10 }).save(true);
  assert.equal(result.phase, "error"); assert.ok(f.calls.some(c => c[0] === "cancel" && c[1] === 42)); assert.ok(!f.calls.some(c => c[0] === "close")); assert.equal(f.revoked.length, 1);
});
test("a navigation timeout does not read cookies and permits a retry after the context is fixed", async () => {
  const f = fakeBrowser(); f.tabs[0].url = "https://www.youtube.com/"; f.api.tabs.update = async () => f.tabs[0];
  const helper = new ExportController(f.api, { ...f, navigationTimeout: 10 }); assert.equal((await helper.save(true)).phase, "error");
  assert.deepEqual(f.calls, []); assert.equal(f.api.tabs.onUpdated.listeners.size, 0); assert.equal((await helper.status()).phase, "ready");
});
test("a new private tab opened while saving is never closed", async () => {
  const f = fakeBrowser(); f.api.downloads.search = async () => { f.tabs.push({ ...f.tabs[0], id: 9 }); return [{ id: 42, state: "complete" }]; };
  const result = await new ExportController(f.api, f).save(true); assert.equal(result.phase, "success"); assert.equal(result.closed, false); assert.ok(!f.calls.some(c => c[0] === "close"));
});
