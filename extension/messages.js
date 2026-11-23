export function messageHandler(controller, api) {
  return (message, sender) => {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL("popup.html")) return undefined;
    if (message?.action === "status") return controller.status();
    if (message?.action === "prepare") return controller.prepare(message.consent, message.tabId, message.permission);
    if (message?.action === "close-youtube") return controller.closeYouTubeTab(message.tabId, message.permission);
    return undefined;
  };
}
