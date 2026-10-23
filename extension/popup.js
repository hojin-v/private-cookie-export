import { safeMessage } from "./core.js";

const status = document.getElementById("status"), consent = document.getElementById("consent"), save = document.getElementById("save"), grant = document.getElementById("grant"), reset = document.getElementById("reset");
let current = { phase: "idle" }, submitted = false;
function render(value) {
  current = value; status.textContent = value.message;
  save.disabled = submitted || value.phase !== "ready" || !consent.checked;
  consent.disabled = submitted || value.phase === "working" || value.phase === "success";
  grant.hidden = value.code !== "host_access";
  reset.hidden = value.phase !== "success";
}
async function refresh() {
  try { render(await browser.runtime.sendMessage({ action: "status" })); }
  catch (error) { render({ phase: "error", message: safeMessage(error) }); }
}
consent.addEventListener("change", () => render(current));
save.addEventListener("click", async () => {
  if (submitted || !consent.checked || current.phase !== "ready") return;
  submitted = true; render({ phase: "working", message: "저장을 시작하고 있습니다." });
  try { render(await browser.runtime.sendMessage({ action: "save", consent: true })); }
  catch { /* Navigating or closing the private tab can close this popup; reopen to see status. */ }
  finally { submitted = false; }
});
grant.addEventListener("click", async () => {
  try { await browser.permissions.request({ origins: ["https://*.youtube.com/*"] }); await refresh(); }
  catch (error) { render({ phase: "error", message: safeMessage(error) }); }
});
reset.addEventListener("click", async () => {
  consent.checked = false;
  try { render(await browser.runtime.sendMessage({ action: "reset" })); }
  catch (error) { render({ phase: "error", message: safeMessage(error) }); }
});
refresh();
const poll = setInterval(refresh, 600);
window.addEventListener("pagehide", () => clearInterval(poll), { once: true });
