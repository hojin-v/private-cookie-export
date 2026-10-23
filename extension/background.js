import { ExportController } from "./exporter.js";
import { messageHandler } from "./messages.js";

const controller = new ExportController(browser);
browser.runtime.onMessage.addListener(messageHandler(controller, browser));
