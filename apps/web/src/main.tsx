import React from "react";
import ReactDOM from "react-dom/client";
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
