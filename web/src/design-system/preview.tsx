import React from "react";
import { createRoot } from "react-dom/client";
import { DesignSystemPreview } from "./DesignSystemPreview";
import "./tokens.css";
import "./primitives.css";

createRoot(document.getElementById("design-system-root")!).render(
  <React.StrictMode>
    <DesignSystemPreview />
  </React.StrictMode>,
);
