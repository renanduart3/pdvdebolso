import type { JSX } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";

import { formatarCentavos } from "../../database/money";
import {
  backupRepository,
  configuracoesRepository
} from "../../database/repositories";
import {
  IDIOMAS_SUPORTADOS,
  MOEDAS_SUPORTADAS,
  type IdiomaAplicacao,
  type MoedaAplicacao
} from "../../database/repositories/configuracoesRepository";
import { getCurrentSession } from "../../monetization/authService";
import type { UserSession } from "../../monetization/contracts";
import {
  temasAplicacao,
  type TemaAplicacao
} from "../../theme/registry";
import styles from "../shared/Management.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

type ConfiguracoesPageProps = {
  online?: boolean;
  tema?: TemaAplicacao;
  onTemaChange?: (tema: TemaAplicacao) => void;
  onBackupStatusChange?: (pendente: boolean) => void;
};

export function ConfiguracoesPage({
  online = true,
  tema = "IMPACTO",
  onTemaChange,
  onBackupStatusChange
}: ConfiguracoesPageProps) {
  const [sessao, setSessao] = useState<UserSession | null>(null);
  const [chavePix, setChavePix] = useState("");
  const [validarEstoque, setValidarEstoque] = useState(false);
  const [temaSelecionado, setTemaSelecionado] = useState<TemaAplicacao>(tema);
  const [idioma, setIdioma] = useState<IdiomaAplicacao>("pt-BR");
  const [moeda, setMoeda] = useState<MoedaAplicacao>("BRL");
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const [backupPendente, setBackupPendente] = useState(false);
  
  const [emailLogin, setEmailLogin] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarBackup = useCallback(async () => {
    const [ultimo, pendente] = await Promise.all([
      backupRepository.obterUltimoBackup(),
      backupRepository.precisaBackup()
    ]);
    setUltimoBackup(ultimo);
    setBackupPendente(pendente);
    return pendente;
  }, []);

  useEffect(() => {
    // Intercepta session_token na URL (retorno do Magic Link)
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const token = hashParams.get("session_token") || urlParams.get("session_token");
    
    if (token) {
      import("../../monetization/authService").then(({ setSessionToken }) => {
        setSessionToken(token);
        // Limpa a URL sem dar reload
        window.history.replaceState({}, document.title, window.location.pathname + "#configuracoes");
        getCurrentSession().then(s => setSessao(s.sessao));
      });
    }

    Promise.all([
      configuracoesRepository.obterChavePix().then(setChavePix),
      configuracoesRepository.obterValidacaoEstoque().then(setValidarEstoque),
      configuracoesRepository.obterIdioma().then(setIdioma),
      configuracoesRepository.obterMoeda().then(setMoeda),
      getCurrentSession().then(s => setSessao(s.sessao)),
      carregarBackup()
    ]).catch((error: unknown) => setErro(mensagemErro(error)));

    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setPersistente).catch(() => {
        setPersistente(null);
      });
    }
  }, [carregarBackup]);

  useEffect(() => {
    setTemaSelecionado(tema);
  }, [tema]);

  async function salvarPix(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      await configuracoesRepository.salvarChavePix(chavePix);
      setChavePix(chavePix.trim());
      setSucesso("Configuração de cobrança salva neste dispositivo.");
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function salvarEstoque(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      await configuracoesRepository.salvarValidacaoEstoque(validarEstoque);
      setSucesso(
        validarEstoque
          ? "Vendas serão bloqueadas quando o estoque for insuficiente."
          : "Vendas poderão deixar o estoque negativo."
      );
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function salvarTema(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      await configuracoesRepository.salvarTema(temaSelecionado);
      onTemaChange?.(temaSelecionado);
      setSucesso(`Tema ${temaSelecionado.toLowerCase()} aplicado neste dispositivo.`);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function salvarIdiomaEMoeda(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      await Promise.all([
        configuracoesRepository.salvarIdioma(idioma),
        configuracoesRepository.salvarMoeda(moeda)
      ]);
      const nomeIdioma = IDIOMAS_SUPORTADOS.find((i) => i.id === idioma)?.nome;
      const nomeMoeda = MOEDAS_SUPORTADAS.find((m) => m.id === moeda)?.nome;
      setSucesso(`Preferências salvas: ${nomeIdioma} • ${nomeMoeda}.`);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function solicitarPersistencia() {
    setProcessando(true);
    setErro(null);
    try {
      if (!navigator.storage?.persist) {
        throw new Error("Este navegador não oferece proteção extra de armazenamento.");
      }
      const concedida = await navigator.storage.persist();
      setPersistente(concedida);
      setSucesso(
        concedida
          ? "Proteção extra de armazenamento ativada."
          : "O navegador não concedeu proteção extra. O backup continua essencial."
      );
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function exportarBackup() {
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const { getSessionToken } = await import("../../monetization/authService");
      const { salvarCofreNuvem } = await import("../../monetization/api");
      
      const token = getSessionToken();
      if (!token) throw new Error("Sessão inválida para backup na nuvem.");

      const exportado = await backupRepository.exportar();
      await salvarCofreNuvem(token, exportado.conteudo);

      setUltimoBackup(exportado.exportado_em);
      setBackupPendente(false);
      setSucesso("Cofre sincronizado na nuvem com sucesso.");
      onBackupStatusChange?.(false);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function restaurarDaNuvem() {
    if (!window.confirm("ATENÇÃO: Isso vai apagar todos os dados atuais e substituir pelo backup da nuvem. Deseja continuar?")) return;
    
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const { getSessionToken } = await import("../../monetization/authService");
      const { baixarCofreNuvem } = await import("../../monetization/api");
      
      const token = getSessionToken();
      if (!token) throw new Error("Sessão inválida para backup na nuvem.");

      const json = await baixarCofreNuvem(token);
      const importado = await backupRepository.importar(json);
      setChavePix(await configuracoesRepository.obterChavePix());
      const pendente = await carregarBackup();
      
      setSucesso(
        `Backup de ${new Intl.DateTimeFormat("pt-BR").format(
          new Date(importado.exportado_em)
        )} restaurado com sucesso.`
      );
      onBackupStatusChange?.(pendente);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function fazerLogin(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (!online) throw new Error("Conecte-se à internet para entrar.");
      const { loginWithMagicLink } = await import("../../monetization/authService");
      await loginWithMagicLink(emailLogin);
      setSucesso("Enviamos um link mágico para o seu e-mail. Verifique sua caixa de entrada e clique no link para logar.");
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function assinarPremium() {
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (!online) throw new Error("Conecte-se à internet para assinar.");
      const { createStripeCheckout } = await import("../../monetization/authService");
      const checkout = await createStripeCheckout();
      window.location.href = checkout.url;
    } catch (error: unknown) {
      setErro(mensagemErro(error));
      setProcessando(false); // only stop if error, else redirecting
    }
  }

  async function sairConta() {
    setProcessando(true);
    setErro(null);
    try {
      const { logout } = await import("../../monetization/authService");
      await logout();
      setSessao(null);
      setSucesso("Você saiu da sua conta.");
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <main class={styles.main}>
      <section class={styles.hero}>
        <span class={styles.eyebrow}>CONFIGURAÇÕES • GERAL</span>
        <h1>DO SEU JEITO.</h1>
        <p>Preferências de cobrança, internacionalização, aparência, segurança e assinatura.</p>
      </section>

      {erro && (
        <div class={`${styles.notice} ${styles.error}`} role="alert">
          <strong>ATENÇÃO:</strong> {erro}
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">×</button>
        </div>
      )}
      {sucesso && (
        <div class={`${styles.notice} ${styles.success}`} role="status">
          <strong>PRONTO:</strong> {sucesso}
          <button type="button" onClick={() => setSucesso(null)} aria-label="Fechar mensagem">×</button>
        </div>
      )}

      <div class={styles.settingsGrid}>
        {/* GRUPO 1: OPERAÇÃO DO NEGÓCIO */}
        <div class={styles.sectionCategory}>
          <span>OPERAÇÃO E COBRANÇA</span>
          <span class={styles.sectionCategoryTag}>NEGÓCIO</span>
        </div>

        <form class={styles.panel} onSubmit={salvarPix}>
          <div class={styles.panelTitle}>
            <span>01</span>
            <h2>COBRANÇA</h2>
          </div>
          <p>A chave PIX será incluída nas mensagens de cobrança pelo WhatsApp.</p>
          <label htmlFor="settings-pix-key">
            CHAVE PIX
            <input
              id="settings-pix-key"
              value={chavePix}
              onInput={(event) => setChavePix(event.currentTarget.value)}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
            />
          </label>
          <button class={styles.button} type="submit" disabled={processando}>
            SALVAR CHAVE PIX
          </button>
        </form>

        <form class={styles.panel} onSubmit={salvarEstoque}>
          <div class={styles.panelTitle}>
            <span>02</span>
            <h2>ESTOQUE NA VENDA</h2>
          </div>
          <p>
            Com a validação ligada, o PDV impede vender mais unidades do que a
            quantidade cadastrada.
          </p>
          <label class={styles.checkLabel}>
            <input
              type="checkbox"
              checked={validarEstoque}
              onChange={(event) =>
                setValidarEstoque(event.currentTarget.checked)
              }
            />
            VALIDAR ESTOQUE ANTES DE FINALIZAR
          </label>
          <button class={styles.button} type="submit" disabled={processando}>
            SALVAR REGRA DE ESTOQUE
          </button>
        </form>

        {/* GRUPO 2: INTERNACIONALIZAÇÃO E INTERFACE */}
        <div class={styles.sectionCategory}>
          <span>INTERNACIONALIZAÇÃO E INTERFACE</span>
          <span class={styles.sectionCategoryTag}>SISTEMA</span>
        </div>

        <form class={styles.panel} onSubmit={salvarIdiomaEMoeda}>
          <div class={styles.panelTitle}>
            <span>03</span>
            <h2>IDIOMA E MOEDA</h2>
          </div>
          <p>Selecione o idioma da interface e a moeda padrão exibida nos relatórios.</p>
          <label htmlFor="settings-language">
            IDIOMA DO SISTEMA
            <select
              id="settings-language"
              value={idioma}
              onChange={(event) => setIdioma(event.currentTarget.value as IdiomaAplicacao)}
            >
              {IDIOMAS_SUPORTADOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="settings-currency">
            MOEDA PADRÃO
            <select
              id="settings-currency"
              value={moeda}
              onChange={(event) => setMoeda(event.currentTarget.value as MoedaAplicacao)}
            >
              {MOEDAS_SUPORTADAS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome} ({item.simbolo})
                </option>
              ))}
            </select>
          </label>

          <div class={styles.currencyPreview}>
            <small>PRÉ-VISUALIZAÇÃO DE FORMATAÇÃO:</small>
            <strong>{formatarCentavos(125000, moeda, idioma)}</strong>
          </div>

          <button class={styles.button} type="submit" disabled={processando}>
            SALVAR PREFERÊNCIAS DE IDIOMA E MOEDA
          </button>
        </form>

        <form class={styles.panel} onSubmit={salvarTema}>
          <div class={styles.panelTitle}>
            <span>04</span>
            <h2>APARÊNCIA E TEMA</h2>
          </div>
          <p>
            Escolha o estilo visual mais confortável. A preferência fica salva
            neste dispositivo e entra no backup.
          </p>
          <div class={styles.themeGrid}>
            {temasAplicacao.map((opcao) => (
              <label
                key={opcao.id}
                class={
                  temaSelecionado === opcao.id
                    ? styles.themeOptionSelected
                    : styles.themeOption
                }
              >
                <input
                  type="radio"
                  name="tema-aplicacao"
                  value={opcao.id}
                  checked={temaSelecionado === opcao.id}
                  onChange={() => setTemaSelecionado(opcao.id)}
                />
                <span>
                  <strong>{opcao.nome}</strong>
                  <small>{opcao.descricao}</small>
                </span>
                <i class={styles.themeSwatches} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </i>
              </label>
            ))}
          </div>
          <button class={styles.button} type="submit" disabled={processando}>
            APLICAR TEMA
          </button>
        </form>

        {/* GRUPO 3: SEGURANÇA E DADOS */}
        <div class={styles.sectionCategory}>
          <span>SEGURANÇA E DADOS</span>
          <span class={styles.sectionCategoryTag}>LOCAL E NUVEM</span>
        </div>

        <section class={`${styles.panel} ${styles.warningPanel}`}>
          <div class={styles.panelTitle}>
            <span>05</span>
            <h2>PROTEÇÃO DO NAVEGADOR</h2>
          </div>
          <p>
            Seus dados estão gravados neste navegador. Apagar os dados do site ou trocar de aparelho pode eliminar o histórico.
          </p>
          <span class={styles.tag}>
            {persistente === true
              ? "ARMAZENAMENTO PROTEGIDO"
              : persistente === false
                ? "PROTEÇÃO EXTRA DESATIVADA"
                : "STATUS NÃO DISPONÍVEL"}
          </span>
          {persistente !== true && (
            <button
              class={styles.secondaryButton}
              type="button"
              onClick={solicitarPersistencia}
              disabled={processando}
            >
              PROTEGER DADOS NESTE DISPOSITIVO
            </button>
          )}
        </section>

        <section
          class={`${styles.panel} ${styles.widePanel} ${
            backupPendente ? styles.dangerPanel : ""
          }`}
        >
          <div class={styles.panelTitle}>
            <span>06</span>
            <h2>COFRE EM NUVEM</h2>
          </div>
          <p>
            O Cofre tira um "Snapshot" inflexível de toda a sua operação local. Tudo o que está neste dispositivo vai para a nuvem.
          </p>

          {!sessao || sessao.plano === "GRATUITO" ? (
            <div class={styles.premiumOverlay}>
              <span class={styles.tag}>🔒 RECURSO PREMIUM</span>
              <p>O Cofre em Nuvem é exclusivo para assinantes. Proteja seu negócio contra perdas, formatações ou acidentes com o dispositivo.</p>
              <button 
                class={styles.premiumButton} 
                type="button" 
                onClick={() => {
                  const section = document.getElementById("assinatura");
                  section?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                ASSINAR AGORA PARA LIBERAR
              </button>
            </div>
          ) : (
            <>
              <span class={styles.tag}>
                {ultimoBackup
                  ? `ÚLTIMO BACKUP NA NUVEM: ${new Intl.DateTimeFormat("pt-BR").format(
                      new Date(ultimoBackup)
                    )}`
                  : "NENHUM BACKUP NA NUVEM REGISTRADO"}
              </span>
              {backupPendente && (
                <p class={styles.dangerText}>
                  COFRE DESATUALIZADO: HÁ NOVAS VENDAS OU CLIENTES DESDE O ÚLTIMO BACKUP.
                </p>
              )}
              <button
                class={styles.button}
                type="button"
                onClick={exportarBackup}
                disabled={processando}
              >
                {processando ? "SINCRONIZANDO COM A NUVEM..." : "SALVAR COFRE PREMIUM"}
              </button>

              <div class={styles.importArea}>
                <h3>RESTAURAR DO COFRE</h3>
                <p>
                  A restauração baixa o arquivo da nuvem e injeta todos os dados, substituindo sem perguntas o banco atual deste aparelho.
                </p>
                <button
                  class={styles.secondaryButton}
                  type="button"
                  onClick={restaurarDaNuvem}
                  disabled={processando}
                >
                  {processando ? "BAIXANDO..." : "RESTAURAR E SUBSTITUIR TUDO"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* GRUPO 4: CONTA E PLANO SAAS */}
        <div class={styles.sectionCategory}>
          <span>CONTA E ASSINATURA</span>
          <span class={styles.sectionCategoryTag}>SAAS</span>
        </div>

        <section class={`${styles.panel} ${styles.widePanel}`} id="assinatura">
          <div class={styles.panelTitle}>
            <span>07</span>
            <h2>O SEU PLANO</h2>
          </div>
          
          {!sessao ? (
            <form class={styles.loginForm} onSubmit={fazerLogin}>
              <h3>CRIE SUA CONTA OU FAÇA LOGIN</h3>
              <p>O PDV de Bolso salva seus dados apenas no navegador. Crie uma conta gratuita para habilitar o Backup na Nuvem e acessar os relatórios Premium.</p>
              <label>
                SEU MELHOR E-MAIL
                <input 
                  type="email" 
                  value={emailLogin} 
                  onInput={(e) => setEmailLogin(e.currentTarget.value)} 
                  required 
                  placeholder="voce@email.com"
                />
              </label>
              <button class={styles.button} type="submit" disabled={processando || !emailLogin}>ENTRAR COM MAGIC LINK</button>
            </form>
          ) : (
            <div class={styles.accountArea}>
              <div class={styles.accountHeader}>
                <strong>CONECTADO COMO {sessao.email.toUpperCase()}</strong>
                <button type="button" onClick={sairConta} class={styles.secondaryButton}>SAIR DA CONTA</button>
              </div>

              {sessao.plano === "GRATUITO" ? (
                <div class={styles.pricingBanner}>
                  <div class={styles.pricingHeader}>
                    <h3>PLANO PREMIUM</h3>
                    <div class={styles.priceTag}>
                      <span>R$</span>
                      <strong>14</strong>
                      <span>,90<br/>/mês</span>
                    </div>
                  </div>
                  <ul class={styles.pricingFeatures}>
                    <li>✓ <strong>Cofre em Nuvem (Snapshot Inflexível)</strong>. Uma cópia exata do seu negócio. Se o seu dispositivo quebrar ou for perdido, faça login no aparelho novo, clique em Restaurar e a nuvem injeta todos os seus clientes e vendas instantaneamente. Sem conflitos, sem perda de dados.</li>
                    <li>✓ <strong>Painel de BI Completo</strong>. Acesse horários de pico, mapas semanais e controle de estoque preditivo para saber exatamente a hora de repor mercadorias.</li>
                    <li>✓ <strong>Cobranças por WhatsApp</strong>. Acabe com a inadimplência com um botão mágico que gera links diretos de cobrança para seus clientes que compram fiado.</li>
                    <li>✓ <strong>Sem Anúncios</strong>. Interface brutalista 100% limpa, rápida e totalmente livre de banners publicitários.</li>
                  </ul>
                  <button class={styles.upgradeButton} type="button" onClick={assinarPremium} disabled={processando}>
                    ASSINAR PLANO PREMIUM AGORA
                  </button>
                  <span class={styles.securePayment}>Pagamento 100% seguro via Stripe. Cancele quando quiser.</span>
                </div>
              ) : (
                <div class={styles.premiumActive}>
                  <span class={styles.premiumBadge}>👑 PREMIUM ATIVADO</span>
                  <p>Você tem acesso ilimitado a todos os gráficos de Inteligência de Negócio, Cobranças pelo WhatsApp e seus dados estão realizando Backup automático na nuvem regularmente.</p>
                  <p>Sua assinatura está ativa e sendo gerenciada pelo Stripe.</p>
                  <button class={styles.secondaryButton} type="button">GERENCIAR ASSINATURA</button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
