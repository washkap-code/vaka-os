import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design-system/tokens.css";
import "./design-system/primitives.css";
import "./styles.css";
import "./landing.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

// Cache only the static shell. API requests and business writes remain
// network-authoritative until the future encrypted offline sync layer exists.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
