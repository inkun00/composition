import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { preloadVexFlow } from "./music/vexflow";
import "./styles.css";
import "./desktop-polish.css";
import "./button-system.css";

preloadVexFlow();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
