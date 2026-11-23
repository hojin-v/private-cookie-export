#!/usr/bin/env node
// Firefox DevTools' temporary-add-on protocol, used only with a fresh disposable profile.
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const binary = process.argv[2];
const scenario = process.argv[3] ?? "youtube";
if (!binary || !["youtube", "generic"].includes(scenario)) throw new Error("Usage: npm run browser-test -- /absolute/path/to/firefox [youtube|generic]");
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "private-cookie-export-browser-test-"));
const profile = path.join(temporary, "profile"), addon = path.join(temporary, "addon"), downloads = path.join(temporary, "downloads");
await Promise.all([mkdir(profile), mkdir(downloads), cp(path.join(root, "extension"), addon, { recursive: true })]);
const manifest = JSON.parse(await readFile(path.join(addon, "manifest.json")));
manifest.background.scripts = ["browser-harness.js"];
manifest.permissions.push("downloads"); // Harness only. The production extension has no downloads API permission.
await writeFile(path.join(addon, "manifest.json"), JSON.stringify(manifest));
await Promise.all(["browser-harness.js", "popup-harness.js"].map(file => cp(path.join(root, "test", file), path.join(addon, file))));
if (scenario === "generic") {
  const harnessPath = path.join(addon, "browser-harness.js");
  await writeFile(harnessPath, (await readFile(harnessPath, "utf8")).replace("const generic = false;", "const generic = true;"));
}
const popupPath = path.join(addon, "popup.html");
await writeFile(popupPath, (await readFile(popupPath, "utf8")).replace("</body>", '<script type="module" src="popup-harness.js"></script></body>'));
const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const prefs = {
  "devtools.debugger.remote-enabled": true, "devtools.chrome.enabled": true, "devtools.debugger.prompt-connection": false,
  "devtools.debugger.force-local": true,
  "browser.download.folderList": 2, "browser.download.dir": downloads, "browser.download.useDownloadDir": true,
  "browser.shell.checkDefaultBrowser": false, "browser.startup.homepage_override.mstone": "ignore",
  "datareporting.policy.dataSubmissionEnabled": false, "toolkit.telemetry.enabled": false,
  "app.normandy.enabled": false, "browser.startup.page": 0, "browser.aboutwelcome.enabled": false
};
await writeFile(path.join(profile, "user.js"), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n"));
// This disposable profile fixture models the user's per-extension private-mode/site consent.
// It never changes the developer's or user's real Firefox profile.
await writeFile(path.join(profile, "extension-preferences.json"), JSON.stringify({
  [manifest.browser_specific_settings.gecko.id]: {
    permissions: ["internal:privateBrowsingAllowed"], origins: [scenario === "generic" ? "https://example.com/*" : "https://*.youtube.com/*"], data_collection: ["authenticationInfo"]
  }
}));
const firefox = spawn(binary, ["--headless", "--no-remote", "--profile", profile, "--start-debugger-server", String(port), "about:blank"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = "", socket, stopped = false;
firefox.stdout.on("data", chunk => { logs = (logs + chunk).slice(-12000); });
firefox.stderr.on("data", chunk => { logs = (logs + chunk).slice(-12000); });
firefox.on("error", error => { logs += error.message; stopped = true; });
firefox.on("exit", () => { stopped = true; });
try {
  for (let i = 0; i < 300; i++) {
    if (stopped) throw new Error("Firefox stopped before debugging was ready");
    try { socket = await connect(port); break; } catch { await delay(100); }
  }
  if (!socket) throw new Error("Firefox debugging connection timed out");
  const client = protocol(socket);
  await client.greeting;
  const rootActor = await client.request({ to: "root", type: "getRoot" });
  if (!rootActor.addonsActor) throw new Error("Firefox has no temporary add-on actor");
  const installed = await client.request({ to: rootActor.addonsActor, type: "installTemporaryAddon", addonPath: addon });
  if (installed.error) throw new Error(`Temporary installation failed: ${installed.error}`);
  let report;
  for (let i = 0; i < 500; i++) {
    if (stopped) throw new Error("Firefox stopped during the extension test");
    try { report = JSON.parse(await readFile(path.join(downloads, "rabbyt-helper-browser-report.json"), "utf8")); break; } catch { await delay(100); }
  }
  if (!report?.ok) throw new Error(report?.error || "Browser report timed out");
  const output = await readFile(path.join(downloads, report.filename), "utf8");
  if (!output.startsWith("# Netscape HTTP Cookie File\n") || !output.includes("TEST_ONLY_NOT_A_REAL_SESSION")) throw new Error("Browser saved an unexpected file");
  const expected = scenario === "generic" ? "\tFIXTURE_SESSION\t" : "\tLOGIN_INFO\t";
  if (!output.includes(expected)) throw new Error("Browser saved a file from the wrong site");
  if (output.includes("FIXTURE_MUST_NOT_EXPORT")) throw new Error("Browser saved a cookie outside the requested store or page path");
  console.log(JSON.stringify({ ok: true, scenario, checks: report.checks, cookieFileVerified: true }, null, 2));
} catch (error) {
  await writeFile(path.join(temporary, "firefox.log"), logs);
  console.error(`Browser test failed: ${error.message}\nDiagnostics: ${temporary}`); process.exitCode = 1;
} finally {
  socket?.destroy();
  if (!stopped && firefox.pid) { try { process.kill(-firefox.pid, "SIGTERM"); } catch { /* Our isolated process already exited. */ } }
  await delay(500);
  if (!process.exitCode) await rm(temporary, { recursive: true, force: true });
}
async function connect(port) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }); socket.once("connect", () => resolve(socket)); socket.once("error", reject);
  });
}
function protocol(socket) {
  let buffer = Buffer.alloc(0), pending, greeted = false, greet;
  const greeting = new Promise(resolve => { greet = resolve; });
  socket.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const colon = buffer.indexOf(58); if (colon < 0) break;
      const size = Number(buffer.subarray(0, colon).toString()); if (!Number.isSafeInteger(size) || size < 0 || size > 1000000) { socket.destroy(); break; }
      if (buffer.length < colon + 1 + size) break;
      const packet = JSON.parse(buffer.subarray(colon + 1, colon + 1 + size).toString()); buffer = buffer.subarray(colon + 1 + size);
      if (!greeted) { greeted = true; greet(packet); }
      else if (pending && packet.from === pending.to) { const done = pending; pending = null; clearTimeout(done.timer); done.resolve(packet); }
    }
  });
  return { greeting, request: packet => new Promise((resolve, reject) => {
    if (pending) { reject(Error("Only one test protocol request at a time")); return; }
    pending = { to: packet.to, resolve, timer: setTimeout(() => { pending = null; reject(Error("Firefox protocol timed out")); }, 15000) };
    const json = JSON.stringify(packet); socket.write(`${Buffer.byteLength(json)}:${json}`);
  }) };
}
