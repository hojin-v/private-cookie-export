import { test } from "node:test";
import assert from "node:assert/strict";
import { ROBOTS_URL, exportNetscape, validateTab, siteForUrl, assertPrivateStore, HelperError, safeMessage, exportFilename } from "../extension/core.js";
import { cookie, cookies, tab } from "./fixtures.js";

test("HTTPS sites are canonicalized and private mode is required", () => {
  for (const url of ["http://youtube.com", "https://youtube.com@evil.example", "https://youtube.com:444/", "file:///youtube.com", "javascript:alert(1)"]) assert.equal(siteForUrl(url), null);
  for (const url of ["https://youtube.com/", "https://www.youtube.com/watch?v=TEST", "https://m.youtube.com/"]) assert.ok(siteForUrl(url));
  assert.equal(siteForUrl("https://youtube.com.evil.example/").youtube, false);
  assert.equal(siteForUrl("https://example.com/").permission, "https://example.com/*");
  assert.equal(siteForUrl("https://m.youtube.com/").permission, "https://www.youtube.com/*");
  for (const extra of [{ incognito: false }, { id: -1 }, { id: "7" }]) assert.throws(() => validateTab({ ...tab(), ...extra }), HelperError);
});
test("only one private tab is permitted without examining other sites' URL or title", () => {
  assertPrivateStore(tab(), [{ id: "firefox-private", tabIds: [7] }, { id: "firefox-default", tabIds: [99] }]);
  assert.throws(() => assertPrivateStore(tab(), [{ id: "firefox-private", tabIds: [7, 99] }]), /one_tab/);
  assert.throws(() => assertPrivateStore(tab(), [{ id: "firefox-private", tabIds: [8] }]), /store/);
});
test("Netscape output preserves host-only, HttpOnly, path, session and persistent expiry", () => {
  const { text, summary } = exportNetscape([...cookies(), cookie("__Secure-3PAPISID", { hostOnly: true, domain: "www.youtube.com", session: false, expirationDate: 2000000000.9, path: "/robots.txt" })], siteForUrl(ROBOTS_URL), 1700000000);
  assert.ok(text.startsWith("# Netscape HTTP Cookie File\n"));
  assert.ok(text.includes("#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tTEST_ONLY_NOT_A_REAL_SESSION"));
  assert.ok(text.includes("#HttpOnly_www.youtube.com\tFALSE\t/robots.txt\tTRUE\t2000000000\t__Secure-3PAPISID"));
  assert.deepEqual(summary, { total: 3, session: 2, httpOnly: 3 });
});
test("YouTube exports only cookies applicable to the www.youtube.com robots.txt URL", () => {
  const data = [
    cookie("OTHER_PATH", { path: "/watch" }),
    cookie("MOBILE_HOST", { domain: "m.youtube.com", hostOnly: true }),
    cookie("PARENT_HOST_ONLY", { domain: "youtube.com", hostOnly: true }),
    cookie("LANGUAGE_SETTING")
  ];
  const { text, summary } = exportNetscape([...cookies(), ...data], siteForUrl(ROBOTS_URL));
  assert.match(text, /\tLANGUAGE_SETTING\t/);
  assert.doesNotMatch(text, /OTHER_PATH|MOBILE_HOST|PARENT_HOST_ONLY/);
  assert.equal(summary.total, 3);
});
test("another site, store, tracking partition, first-party domain or expired cookie never reaches output", () => {
  const data = [cookie("EXPIRED", { session: false, expirationDate: 1 }), cookie("OTHER_SITE", { domain: ".google.com" }), cookie("BAD_BOUNDARY", { domain: ".notyoutube.com" }), cookie("NORMAL", { storeId: "firefox-default" }), cookie("PARTITION", { partitionKey: { topLevelSite: "https://example.test" } }), cookie("FPI", { firstPartyDomain: "example.test" })];
  const { text, summary } = exportNetscape([...cookies(), ...data], siteForUrl("https://www.youtube.com/"));
  for (const c of data) assert.ok(!text.includes(c.name));
  assert.deepEqual(summary, { total: 2, session: 2, httpOnly: 2 });
});
test("both YouTube login and API session information are required", () => {
  for (const data of [[], [cookie()], [cookie("SAPISID")], [cookie("LOGIN_INFO", { value: "" }), cookie("SAPISID")]]) assert.throws(() => exportNetscape(data, siteForUrl("https://www.youtube.com/")), /not_logged_in/);
});
test("generic exports preserve applicable parent domain and path, never sibling or host-only parent cookies", () => {
  const site = siteForUrl("https://portal.example.com/app/dashboard");
  const data = [
    cookie("SHARED", { domain: ".example.com", path: "/app" }),
    cookie("LOCAL", { domain: "portal.example.com", hostOnly: true }),
    cookie("PARENT_ONLY", { domain: "example.com", hostOnly: true }),
    cookie("SIBLING", { domain: ".store.example.com" }),
    cookie("WRONG_PATH", { domain: ".example.com", path: "/ap" }),
    cookie("OTHER_STORE", { domain: ".example.com", storeId: "firefox-default" })
  ];
  const { text } = exportNetscape(data, site);
  assert.match(text, /#HttpOnly_\.example\.com\tTRUE\t\/app\tTRUE\t0\tSHARED\t/);
  assert.match(text, /#HttpOnly_portal\.example\.com\tFALSE\t\/\tTRUE\t0\tLOCAL\t/);
  assert.doesNotMatch(text, /PARENT_ONLY|SIBLING|WRONG_PATH|OTHER_STORE/);
});
test("line/header injection, ambiguous duplicates and oversized exports are rejected without exposing values", () => {
  for (const data of [[cookie("LOGIN_INFO", { value: "TEST\nSECRET" }), cookie("SAPISID")], [...cookies(), cookie("BAD\tNAME")], [...cookies(), cookie("SAPISID", { value: "OTHER_TEST_VALUE" })]]) {
    assert.throws(() => exportNetscape(data, siteForUrl("https://www.youtube.com/")), error => {
      assert.equal(error.code, "invalid_cookie"); assert.ok(!safeMessage(error).includes("TEST")); return true;
    });
  }
  assert.throws(() => exportNetscape([...cookies(), cookie("LARGE", { value: "x".repeat(262144) })], siteForUrl("https://www.youtube.com/")), /too_large/);
});
test("user errors and generated filenames contain no account identifiers or raw browser errors", () => {
  assert.ok(!safeMessage(Error("TOKEN_TEST_MUST_NOT_LEAK")).includes("TOKEN"));
  assert.equal(exportFilename(new Date("2026-10-23T12:34:56Z"), 12), "cookies-20261023T123456Z-0000000c.txt");
});
