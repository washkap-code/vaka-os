import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getLocale, subscribeLocale } from "./locales";
import "./design-system/tokens.css";
import "./design-system/primitives.css";
import "./styles.css";
import "./landing.css";

// Remount the application when the language changes so every rendered string
// re-resolves against the active locale dictionary (PI18N-001).
function Root() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  return <App key={locale} />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);

// Cache only the static shell. API requests and business writes remain
// network-authoritative until the future encrypted offline sync layer exists.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
