import { createRoot } from "react-dom/client";
import { GameApp } from "./GameApp.tsx";
import "../styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<GameApp />);
