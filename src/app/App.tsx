import { useEffect, useState } from "preact/hooks";

import { formatarCentavos } from "../database/money";
import {
  backupRepository,
  biRepository,
  catalogoRepository,
  clientesRepository,
  configuracoesRepository,
  licencaRepository
} from "../database/repositories";
import { BiPage } from "../features/bi/BiPage";
import { CatalogoPage } from "../features/catalogo/CatalogoPage";
import { ClientesPage } from "../features/clientes/ClientesPage";
import { ConfiguracoesPage } from "../features/configuracoes/ConfiguracoesPage";
import { FiadoPage } from "../features/fiado/FiadoPage";
import { AdSlot } from "../features/monetization/AdSlot";
import { PdvPage } from "../features/pdv/PdvPage";
import type {
  EstadoLicenca,
  ProvedorAnuncios
} from "../monetization/contracts";
import {
  TEMA_PADRAO,
  type TemaAplicacao
} from "../theme/registry";
import styles from "./App.module.css";

type View =
  | "pdv"
  | "fiado"
  | "catalogo"
  | "clientes"
  | "bi"
  | "configuracoes";

type NavigationItem = {
  view: View | null;
  label: string;
  shortLabel: string;
  color: "green" | "orange" | "purple" | "pink";
  icon: string;
};

const navigationItems: NavigationItem[] = [
  {
    view: "bi",
    label: "Inteligência",
    shortLabel: "BI",
    color: "green",
    icon: "01"
  },
  { view: "pdv", label: "Vender", shortLabel: "PDV", color: "green", icon: "02" },
  { view: "fiado", label: "Fiado", shortLabel: "Fiado", color: "orange", icon: "03" },
  {
    view: "catalogo",
    label: "Produtos e Serviços",
    shortLabel: "Itens",
    color: "purple",
    icon: "04"
  },
  {
    view: "clientes",
    label: "Clientes",
    shortLabel: "Clientes",
    color: "pink",
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

type AppProps = {
  provedorAnuncios?: ProvedorAnuncios | null;
};

export function App({ provedorAnuncios = null }: AppProps) {
  const online = useOnlineStatus();
  const [view, setView] = useState<View>("pdv");
  const [backupPendente, setBackupPendente] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [ocultarValores, setOcultarValores] = useState(false);
  const [dadosVersao, setDadosVersao] = useState(0);
  const [tema, setTema] = useState<TemaAplicacao>(TEMA_PADRAO);
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca | null>(null);
  const [resumoCabecalho, setResumoCabecalho] = useState({
    produtos: 0,
    clientes: 0,
    faturamentoHoje: 0,
    faturamentoMes: 0,
    ultimoBackup: null as string | null
  });

  useEffect(() => {
    let ativo = true;
    Promise.all([
      backupRepository.precisaBackup(),
      backupRepository.obterUltimoBackup(),
      catalogoRepository.listarPagina({ tamanho: 1 }),
      clientesRepository.listarPagina({ tamanho: 1 }),
      biRepository.obterIndicadores()
    ])
      .then(([pendente, ultimoBackup, catalogo, clientes, indicadores]) => {
        if (!ativo) return;
        setBackupPendente(pendente);
        setResumoCabecalho({
          produtos: catalogo.total,
          clientes: clientes.total,
          faturamentoHoje: indicadores.caixa.hoje_centavos,
          faturamentoMes: indicadores.caixa.mes_centavos,
          ultimoBackup
        });
      })
      .catch(() => {
        if (ativo) setBackupPendente(false);
      });
    return () => {
      ativo = false;
    };
  }, [dadosVersao, view]);

  useEffect(() => {
    let ativo = true;
    licencaRepository
      .obterEstado()
      .then((estado) => {
        if (ativo) setEstadoLicenca(estado);
      })
      .catch(() => {
        if (ativo) setEstadoLicenca(null);
      });
    return () => {
      ativo = false;
    };
  }, [dadosVersao]);

  useEffect(() => {
    let ativo = true;
    configuracoesRepository
      .obterTema()
      .then((temaSalvo) => {
        if (ativo) setTema(temaSalvo);
      })
      .catch(() => {
        if (ativo) setTema(TEMA_PADRAO);
      });
    return () => {
      ativo = false;
    };
  }, [dadosVersao]);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
  }, [tema]);

  function dadosAlterados() {
    setDadosVersao((atual) => atual + 1);
  }

  function navegar(proximaView: View) {
    setView(proximaView);
  }

  function renderizarView() {
    switch (view) {
      case "fiado":
        return <FiadoPage onDataChange={dadosAlterados} />;
      case "catalogo":
        return <CatalogoPage onDataChange={dadosAlterados} />;
      case "clientes":
        return <ClientesPage onDataChange={dadosAlterados} />;
      case "bi":
        return <BiPage />;
      case "configuracoes":
        return (
          <ConfiguracoesPage
            plano={estadoLicenca?.plano ?? "GRATUITO"}
            estadoLicenca={estadoLicenca}
            online={online}
            tema={tema}
            onTemaChange={setTema}
            onLicenseChange={dadosAlterados}
            onBackupStatusChange={(pendente) => {
              setBackupPendente(pendente);
              dadosAlterados();
            }}
          />
        );
      default:
        return (
          <PdvPage
            onOpenProdutos={() => navegar("catalogo")}
            onOpenClientes={() => navegar("clientes")}
            onDataChange={dadosAlterados}
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

        <div class={styles.headerStats} aria-label="Resumo rápido do negócio">
          <span><small>PRODUTOS</small><strong>{resumoCabecalho.produtos}</strong></span>
          <span><small>CLIENTES</small><strong>{resumoCabecalho.clientes}</strong></span>
          <span><small>HOJE</small><strong>{ocultarValores ? "R$ •••" : formatarCentavos(resumoCabecalho.faturamentoHoje)}</strong></span>
          <span><small>MÊS</small><strong>{ocultarValores ? "R$ •••" : formatarCentavos(resumoCabecalho.faturamentoMes)}</strong></span>
          <span><small>BACKUP</small><strong>{resumoCabecalho.ultimoBackup ? new Intl.DateTimeFormat("pt-BR").format(new Date(resumoCabecalho.ultimoBackup)) : "NUNCA"}</strong></span>
        </div>

        <div class={styles.headerActions}>
          <span class={`${styles.connectionBadge} ${online ? styles.online : styles.offline}`} role="status"><span aria-hidden="true">●</span> {online ? "ONLINE" : "OFFLINE"}</span>
          <button class={styles.headerIconButton} type="button" onClick={() => setOcultarValores((atual) => !atual)} aria-label={ocultarValores ? "Mostrar valores monetários" : "Ocultar valores monetários"}>{ocultarValores ? "R$" : "◉"}</button>
          <button class={styles.headerIconButton} type="button" onClick={() => setNotificacoesAbertas((atual) => !atual)} aria-label="Abrir notificações" aria-expanded={notificacoesAbertas}>♢{(backupPendente || !online) && <span class={styles.notificationDot} />}</button>
        </div>

        {notificacoesAbertas && (
          <section class={styles.notificationsPanel} aria-label="Notificações do sistema">
            <div><strong>NOTIFICAÇÕES</strong><button type="button" onClick={() => setNotificacoesAbertas(false)} aria-label="Fechar notificações">×</button></div>
            <div class={styles.notificationStats}>
              <span>PRODUTOS <strong>{resumoCabecalho.produtos}</strong></span>
              <span>CLIENTES <strong>{resumoCabecalho.clientes}</strong></span>
              <span>HOJE <strong>{ocultarValores ? "R$ •••" : formatarCentavos(resumoCabecalho.faturamentoHoje)}</strong></span>
              <span>MÊS <strong>{ocultarValores ? "R$ •••" : formatarCentavos(resumoCabecalho.faturamentoMes)}</strong></span>
            </div>
            {backupPendente && <button class={styles.notificationItem} type="button" onClick={() => { navegar("configuracoes"); setNotificacoesAbertas(false); }}><strong>BACKUP PENDENTE</strong><span>Proteja seus dados com uma nova exportação.</span></button>}
            {!online && <article class={styles.notificationItem}><strong>VOCÊ ESTÁ OFFLINE</strong><span>O PDV continua funcionando normalmente.</span></article>}
            {!backupPendente && online && <article class={styles.notificationEmpty}><strong>TUDO EM ORDEM.</strong><span>Nenhuma ação necessária agora.</span></article>}
          </section>
        )}
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
          <AdSlot
            online={online}
            semAnuncios={estadoLicenca?.plano !== "GRATUITO"}
            provedor={provedorAnuncios}
          />
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
