import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design-system/tokens.css";
import "./design-system/primitives.css";
import "./styles.css";
import "./landing.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
