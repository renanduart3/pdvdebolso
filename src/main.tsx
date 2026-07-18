import { render } from "preact";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/App";
import { database } from "./database/database";
import "./styles/tokens.css";
import "./styles/global.css";

registerSW({ immediate: true });

void database.open().catch((error: unknown) => {
  console.error("Não foi possível abrir o banco local.", error);
});

const root = document.getElementById("app");

if (!root) {
  throw new Error("Elemento raiz #app não encontrado.");
}

render(<App />, root);

