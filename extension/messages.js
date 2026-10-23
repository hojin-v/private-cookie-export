export function messageHandler(controller, api) {
  return (message, sender) => {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL("popup.html") || sender.tab) return undefined;
    if (message?.action === "status") return controller.status();
    if (message?.action === "save") return controller.save(message.consent);
    if (message?.action === "reset") {
      if (!controller.running) controller.state = { phase: "idle", message: "" };
      return controller.status();
    }
    return undefined;
  };
}
