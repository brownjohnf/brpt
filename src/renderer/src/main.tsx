import { Temporal } from "@js-temporal/polyfill";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Temporal = Temporal;

import "./App.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
