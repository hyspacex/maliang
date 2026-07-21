import "@fontsource/bangers/400.css";
import "@fontsource/patrick-hand/400.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MaliangApp } from "./MaliangApp";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Maliang root element is missing.");

createRoot(root).render(
  <StrictMode>
    <MaliangApp />
  </StrictMode>
);
