import { test } from "node:test";
import assert from "node:assert/strict";
import { exportNetscape, validateTab, youtubeUrl, assertSameTab, HelperError, safeMessage, exportFilename } from "../extension/core.js";
import { cookie, cookies, tab } from "./fixtures.js";

test("only exact HTTPS YouTube origins and the actual Firefox private store are accepted", () => {
  for (const url of ["http://youtube.com", "https://youtube.com.evil.example", "https://youtube.com@evil.example", "https://youtube.com:444/", "file:///youtube.com", "javascript:alert(1)"]) assert.equal(youtubeUrl(url), null);
  for (const url of ["https://youtube.com/", "https://www.youtube.com/watch?v=TEST", "https://m.youtube.com/"]) assert.ok(youtubeUrl(url));
  for (const extra of [{ incognito: false }, { cookieStoreId: "firefox-default" }, { cookieStoreId: "" }]) assert.throws(() => validateTab({ ...tab(), ...extra }), HelperError);
});
test("only one private tab is permitted without examining other sites' URL or title", () => {
  const original = tab(); assertSameTab(original, tab(), [tab(), { id: 99, incognito: false }], true);
  assert.throws(() => assertSameTab(original, tab(), [tab(), { id: 99, incognito: true, cookieStoreId: "firefox-private" }]), /one_tab/);
  assert.throws(() => assertSameTab(original, { ...tab(), id: 8 }, [{ ...tab(), id: 8 }]), /changed/);
});
test("Netscape output preserves host-only, HttpOnly, path, session and persistent expiry", () => {
  const text = exportNetscape([...cookies(), cookie("__Secure-3PAPISID", { hostOnly: true, domain: "www.youtube.com", session: false, expirationDate: 2000000000.9, path: "/account" })], "firefox-private", 1700000000);
  assert.ok(text.startsWith("# Netscape HTTP Cookie File\n"));
  assert.ok(text.includes("#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tTEST_ONLY_NOT_A_REAL_SESSION"));
  assert.ok(text.includes("#HttpOnly_www.youtube.com\tFALSE\t/account\tTRUE\t2000000000\t__Secure-3PAPISID"));
});
test("another site, store, tracking partition, first-party domain or expired cookie never reaches output", () => {
  const data = [cookie("EXPIRED", { session: false, expirationDate: 1 }), cookie("OTHER_SITE", { domain: ".google.com" }), cookie("BAD_BOUNDARY", { domain: ".notyoutube.com" }), cookie("NORMAL", { storeId: "firefox-default" }), cookie("PARTITION", { partitionKey: { topLevelSite: "https://example.test" } }), cookie("FPI", { firstPartyDomain: "example.test" })];
  const text = exportNetscape([...cookies(), ...data], "firefox-private");
  for (const c of data) assert.ok(!text.includes(c.name));
});
test("both YouTube login and API session information are required", () => {
  for (const data of [[], [cookie()], [cookie("SAPISID")], [cookie("LOGIN_INFO", { value: "" }), cookie("SAPISID")]]) assert.throws(() => exportNetscape(data, "firefox-private"), /not_logged_in/);
});
test("line/header injection, ambiguous duplicates and oversized exports are rejected without exposing values", () => {
  for (const data of [[cookie("LOGIN_INFO", { value: "TEST\nSECRET" }), cookie("SAPISID")], [cookie("LOGIN_INFO", { path: "/bad\tpath" }), cookie("SAPISID")], [...cookies(), cookie("SAPISID", { value: "OTHER_TEST_VALUE" })]]) {
    assert.throws(() => exportNetscape(data, "firefox-private"), error => {
      assert.equal(error.code, "invalid_cookie"); assert.ok(!safeMessage(error).includes("TEST")); return true;
    });
  }
  assert.throws(() => exportNetscape([...cookies(), cookie("LARGE", { value: "x".repeat(262144) })], "firefox-private"), /too_large/);
});
test("user errors and generated filenames contain no account identifiers or raw browser errors", () => {
  assert.ok(!safeMessage(Error("TOKEN_TEST_MUST_NOT_LEAK")).includes("TOKEN"));
  assert.equal(exportFilename(new Date("2026-10-23T12:34:56Z"), 12), "RabbYT-youtube-login-20261023T123456Z-0000000c.txt");
});
