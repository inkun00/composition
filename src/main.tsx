import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { preloadVexFlow } from "./music/vexflow";
import "./styles.css";
import "./styles/song-structure.css";
import "./styles/candidate-feeling-tabs.css";
import "./desktop-polish.css";
import "./mobile-polish.css";
import "./styles/composition-flow.css";
import "./styles/save-share-polish.css";
import "./styles/card-consistency.css";
import "./styles/semantic-colors.css";

preloadVexFlow();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
