import { test } from "node:test";
import assert from "node:assert/strict";
import { ExportController } from "../extension/exporter.js";
import { ROBOTS_URL, YOUTUBE_ORIGIN } from "../extension/core.js";
import { fakeBrowser } from "./fixtures.js";

test("opening status or omitting consent never reads cookie values", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  assert.equal((await helper.status()).phase, "ready");
  assert.equal((await helper.prepare(false, 7, YOUTUBE_ORIGIN)).phase, "error");
  assert.deepEqual(f.calls, []);
});

test("the Android-compatible path works without Tab.cookieStoreId or the downloads API", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  const ready = await helper.status();
  const result = await helper.prepare(true, ready.tabId, ready.permission);
  assert.equal(result.phase, "prepared");
  assert.equal(result.tabId, 7);
  assert.deepEqual(result.summary, { total: 2, session: 2, httpOnly: 2 });
  assert.deepEqual(f.calls, [["cookies", { url: ROBOTS_URL, storeId: "firefox-private", firstPartyDomain: "" }]]);
  assert.ok((await result.file.text()).startsWith("# Netscape HTTP Cookie File"));
  assert.ok(!JSON.stringify(await helper.status()).includes("TEST_ONLY_NOT_A_REAL_SESSION"));
  assert.ok(!Object.values(helper).some(value => value instanceof Blob));
});

test("one preparation moves the same YouTube tab and reads only after navigation", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  f.tabs[0].url = "https://m.youtube.com/watch?v=TEST";
  f.data.push({ ...f.data[0], name: "MOBILE_HOST", domain: "m.youtube.com", hostOnly: true });
  assert.equal((await helper.status()).phase, "ready");
  const result = await helper.prepare(true, 7, YOUTUBE_ORIGIN);
  assert.equal(result.phase, "prepared");
  assert.doesNotMatch(await result.file.text(), /MOBILE_HOST/);
  assert.deepEqual(f.calls.map(call => call[0]), ["navigate", "cookies"]);
  assert.deepEqual(f.calls[0], ["navigate", 7, ROBOTS_URL]);
});

test("YouTube preparation waits through a hidden URL and a stale active-tab snapshot", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  f.tabs[0].url = "https://m.youtube.com/watch?v=TEST";
  const initial = { ...f.tabs[0] };
  const get = f.api.tabs.get;
  let snapshots = 0;
  f.api.tabs.query = async () => [initial];
  f.api.tabs.get = async id => {
    snapshots++;
    if (snapshots === 2) return { ...initial, url: undefined, status: "loading" };
    if (snapshots === 3) return { ...initial, url: "about:blank", status: "loading" };
    return get(id);
  };
  assert.equal((await helper.prepare(true, 7, YOUTUBE_ORIGIN)).phase, "prepared");
  assert.deepEqual(f.calls.map(call => call[0]), ["navigate", "cookies"]);
});

test("a real redirect away from the YouTube save page never reads cookies", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  f.tabs[0].url = "https://www.youtube.com/";
  f.api.tabs.update = async () => { f.tabs[0].url = "https://accounts.google.com/"; };
  assert.equal((await helper.prepare(true, 7, YOUTUBE_ORIGIN)).phase, "error");
  assert.deepEqual(f.calls, []);
});

test("closing only removes the selected private YouTube save tab", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  assert.equal((await helper.closeYouTubeTab(8, YOUTUBE_ORIGIN)).phase, "error");
  f.tabs[0].url = "https://www.youtube.com/";
  assert.equal((await helper.closeYouTubeTab(7, YOUTUBE_ORIGIN)).phase, "error");
  f.tabs[0].url = ROBOTS_URL;
  f.tabs[0].incognito = false;
  assert.equal((await helper.closeYouTubeTab(7, YOUTUBE_ORIGIN)).phase, "error");
  f.tabs[0].incognito = true;
  assert.equal((await helper.closeYouTubeTab(7, YOUTUBE_ORIGIN)).phase, "closed");
  assert.deepEqual(f.calls, [["close", 7]]);
});

test("a generic site reads only the current page scope and refuses an unrelated grant", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api);
  f.tabs[0].url = "https://accounts.example.com/app/dashboard";
  f.data.splice(0, f.data.length, {
    domain: ".example.com", path: "/app", name: "session", value: "FIXTURE", storeId: "firefox-private",
    session: true, secure: true, httpOnly: true, hostOnly: false
  });
  const ready = await helper.status();
  assert.equal(ready.permission, "https://accounts.example.com/*");
  assert.equal((await helper.prepare(true, 7, "https://example.com/*")).phase, "error");
  assert.deepEqual(f.calls, []);
  const result = await helper.prepare(true, 7, ready.permission);
  assert.equal(result.phase, "prepared");
  assert.match(await result.file.text(), /#HttpOnly_\.example\.com/);
  assert.deepEqual(f.calls, [["cookies", { url: f.tabs[0].url, storeId: "firefox-private", firstPartyDomain: "" }]]);
});

test("ordinary or ambiguous stores, revoked access and multiple private tabs never expose values", async () => {
  const changes = [
    f => { f.tabs[0].incognito = false; },
    f => { f.stores[0].id = "firefox-default"; },
    f => { f.stores[1].tabIds.push(7); },
    f => { f.api.extension.isAllowedIncognitoAccess = async () => false; },
    f => { f.api.permissions.contains = async () => false; },
    f => { f.stores[0].tabIds.push(9); }
  ];
  for (const change of changes) {
    const f = fakeBrowser(); change(f);
    assert.equal((await new ExportController(f.api).prepare(true, 7, YOUTUBE_ORIGIN)).phase, "error");
    assert.deepEqual(f.calls, []);
  }
});

test("tab, origin or private store changes during read prevent file preparation", async () => {
  for (const change of [f => { f.tabs[0].id = 12; }, f => { f.tabs[0].url = "https://accounts.google.com/"; }, f => { f.stores[0].tabIds.push(9); }]) {
    const f = fakeBrowser(), getAll = f.api.cookies.getAll;
    f.api.cookies.getAll = async query => { const result = await getAll(query); change(f); return result; };
    const result = await new ExportController(f.api).prepare(true, 7, YOUTUBE_ORIGIN);
    assert.equal(result.phase, "error");
    assert.equal(result.file, undefined);
  }
});

test("concurrent preparations are rejected and a failed read allows a retry", async () => {
  const f = fakeBrowser(), helper = new ExportController(f.api), getAll = f.api.cookies.getAll;
  let fail;
  f.api.cookies.getAll = async () => new Promise((resolve, reject) => { fail = reject; });
  const running = helper.prepare(true, 7, YOUTUBE_ORIGIN);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await helper.prepare(true, 7, YOUTUBE_ORIGIN)).phase, "error");
  fail(new Error("FIXTURE_VALUE_MUST_NOT_LEAK"));
  assert.ok(!JSON.stringify(await running).includes("FIXTURE_VALUE_MUST_NOT_LEAK"));
  f.api.cookies.getAll = getAll;
  assert.equal((await helper.prepare(true, 7, YOUTUBE_ORIGIN)).phase, "prepared");
});
