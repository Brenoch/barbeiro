import React from "react";
import { createRoot } from "react-dom/client";
import BartApp from "../app/bart-app";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BartApp />
  </React.StrictMode>,
);
