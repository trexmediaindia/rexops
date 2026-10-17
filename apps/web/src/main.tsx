import React from "react";
import ReactDOM from "react-dom/client";
// Bundled with the app (no font CDN): Inter for text, Archivo Black for big headings,
// IBM Plex Mono for timecodes and numbers. Latin subsets only, to keep the download small.
import "@fontsource-variable/inter/wght.css";
import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@rexops/ui/styles.css";
import "./styles.css";
import "./enhancements.css";
import { App } from "./app";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("RexOps root element was not found.");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
