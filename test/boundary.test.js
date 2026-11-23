import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { messageHandler } from "../extension/messages.js";

test("only the extension's own popup can start an export", async () => {
  const calls = [], controller = { status: () => "ready", prepare: (consent, tabId) => calls.push([consent, tabId]) };
  const api = { runtime: { id: "TEST_EXTENSION", getURL: p => `moz-extension://TEST_UUID/${p}` } };
  const handle = messageHandler(controller, api), sender = { id: "TEST_EXTENSION", url: api.runtime.getURL("popup.html") };
  const request = { action: "prepare", consent: true, tabId: 7, permission: "https://example.com/*" };
  for (const bad of [{ ...sender, id: "OTHER_EXTENSION" }, { ...sender, url: "https://www.youtube.com/" }, { ...sender, url: api.runtime.getURL("privacy.html") }]) assert.equal(handle(request, bad), undefined);
  assert.deepEqual(calls, []); handle(request, sender); assert.deepEqual(calls, [[true, 7]]);
  assert.equal(handle({ action: "unknown" }, sender), undefined);
});
test("the distributable has only optional per-site access and no content injection or remote communication", async () => {
  const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url)));
  assert.deepEqual(manifest.permissions, ["activeTab", "cookies"]);
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
  for (const key of ["host_permissions", "content_scripts", "web_accessible_resources", "externally_connectable"]) assert.equal(manifest[key], undefined);
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["authenticationInfo"]);
});
test("both supported locales cover the popup and the file and permission guide", async () => {
  const extension = new URL("../extension/", import.meta.url);
  const read = filename => readFile(new URL(filename, extension), "utf8");
  const [english, korean] = await Promise.all(["en", "ko"].map(async locale => {
    const catalog = JSON.parse(await read(`_locales/${locale}/messages.json`));
    assert.equal(catalog.localeTag.message, locale);
    return catalog;
  }));
  assert.deepEqual(Object.keys(english).sort(), Object.keys(korean).sort());
  for (const file of ["popup.html", "privacy.html"]) {
    for (const [, key] of (await read(file)).matchAll(/data-message="([^"]+)"/g)) {
      assert.ok(english[key]?.message && korean[key]?.message, `${file}: ${key}`);
    }
  }
});
