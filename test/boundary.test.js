import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { messageHandler } from "../extension/messages.js";

test("only the extension's own popup can start an export", async () => {
  const calls = [], controller = { status: () => "ready", save: consent => calls.push(consent) };
  const api = { runtime: { id: "TEST_EXTENSION", getURL: p => `moz-extension://TEST_UUID/${p}` } };
  const handle = messageHandler(controller, api), sender = { id: "TEST_EXTENSION", url: api.runtime.getURL("popup.html") };
  for (const bad of [{ ...sender, id: "OTHER_EXTENSION" }, { ...sender, url: "https://www.youtube.com/" }, { ...sender, tab: { id: 1 } }, { ...sender, url: api.runtime.getURL("privacy.html") }]) assert.equal(handle({ action: "save", consent: true }, bad), undefined);
  assert.deepEqual(calls, []); handle({ action: "save", consent: true }, sender); assert.deepEqual(calls, [true]);
  assert.equal(handle({ action: "unknown" }, sender), undefined);
});
test("the distributable declares only YouTube access, no content injection or remote communication", async () => {
  const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url)));
  assert.deepEqual(manifest.permissions, ["cookies", "downloads"]); assert.deepEqual(manifest.host_permissions, ["https://*.youtube.com/*"]);
  for (const key of ["optional_host_permissions", "content_scripts", "web_accessible_resources", "externally_connectable"]) assert.equal(manifest[key], undefined);
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["authenticationInfo"]);
});
