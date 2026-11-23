export function message(key, substitutions) {
  return (key && browser.i18n.getMessage(key, substitutions)) || browser.i18n.getMessage("error_internal");
}

document.documentElement.lang = message("localeTag");
for (const element of document.querySelectorAll("[data-message]")) {
  element.textContent = message(element.dataset.message);
}
