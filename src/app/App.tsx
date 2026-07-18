import { useEffect, useState } from "preact/hooks";

import { CatalogoPage } from "../features/catalogo/CatalogoPage";
import { ClientesPage } from "../features/clientes/ClientesPage";
import { ConfiguracoesPage } from "../features/configuracoes/ConfiguracoesPage";
import { FiadoPage } from "../features/fiado/FiadoPage";
import { PdvPage } from "../features/pdv/PdvPage";
import styles from "./App.module.css";

type View = "pdv" | "fiado" | "catalogo" | "clientes" | "configuracoes";

type NavigationItem = {
  view: View | null;
  label: string;
  shortLabel: string;
  color: "green" | "orange" | "purple" | "pink";
  icon: string;
};

const navigationItems: NavigationItem[] = [
  { view: "pdv", label: "Vender", shortLabel: "PDV", color: "green", icon: "01" },
  { view: "fiado", label: "Fiado", shortLabel: "Fiado", color: "orange", icon: "02" },
  {
    view: "catalogo",
    label: "Produtos e Serviços",
    shortLabel: "Itens",
    color: "purple",
    icon: "03"
  },
  {
    view: "clientes",
    label: "Clientes",
    shortLabel: "Clientes",
    color: "pink",
    icon: "04"
  },
  {
    view: null,
    label: "Inteligência",
    shortLabel: "BI",
    color: "green",
    icon: "05"
  },
  {
    view: "configuracoes",
    label: "Configurações",
    shortLabel: "Ajustes",
    color: "orange",
    icon: "06"
  }
];

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return online;
}

export function App() {
  const online = useOnlineStatus();
  const [view, setView] = useState<View>("pdv");

  function navegar(proximaView: View) {
    setView(proximaView);
  }

  function renderizarView() {
    switch (view) {
      case "fiado":
        return <FiadoPage />;
      case "catalogo":
        return <CatalogoPage />;
      case "clientes":
        return <ClientesPage />;
      case "configuracoes":
        return <ConfiguracoesPage />;
      default:
        return (
          <PdvPage
            onOpenProdutos={() => navegar("catalogo")}
            onOpenClientes={() => navegar("clientes")}
          />
        );
    }
  }

  return (
    <div class={styles.app}>
      <header class={styles.header}>
        <a class={styles.brand} href="/" aria-label="PDV de Bolso — início">
          <span class={styles.brandMark} aria-hidden="true">
            P
          </span>
          <span>
            <strong>PDV DE BOLSO</strong>
            <small>SEU NEGÓCIO. NO SEU CONTROLE.</small>
          </span>
        </a>

        <span
          class={`${styles.connectionBadge} ${online ? styles.online : styles.offline}`}
          role="status"
        >
          <span aria-hidden="true">●</span> {online ? "ONLINE" : "OFFLINE"}
        </span>
      </header>

      <div class={styles.workspace}>
        <aside class={styles.sidebar} aria-label="Navegação principal">
          <span class={styles.sidebarLabel}>MENU RÁPIDO</span>
          <nav>
            {navigationItems.map((item) => (
              <button
                key={item.label}
                class={`${styles.navButton} ${styles[item.color]}`}
                type="button"
                aria-current={item.view === view ? "page" : undefined}
                disabled={!item.view}
                onClick={() => item.view && navegar(item.view)}
                title={item.view ? `Abrir ${item.label}` : "Disponível nas próximas etapas"}
              >
                <span class={styles.navNumber} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div class={styles.localDataNote}>
            <strong>100% LOCAL</strong>
            <span>Seus dados ficam neste dispositivo.</span>
          </div>
        </aside>

        {renderizarView()}
      </div>

      <nav class={styles.mobileNav} aria-label="Navegação principal">
        {navigationItems.map((item) => (
          <button
            key={item.label}
            type="button"
            class={item.view === view ? styles.mobileActive : undefined}
            disabled={!item.view}
            onClick={() => item.view && navegar(item.view)}
            aria-current={item.view === view ? "page" : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.shortLabel}
          </button>
        ))}
      </nav>
    </div>
  );
}
