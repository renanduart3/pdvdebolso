import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { configuracoesRepository } from "../../database/repositories";
import styles from "../shared/Management.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

export function ConfiguracoesPage() {
  const [chavePix, setChavePix] = useState("");
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    configuracoesRepository
      .obterChavePix()
      .then(setChavePix)
      .catch((error: unknown) => setErro(mensagemErro(error)));

    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setPersistente).catch(() => {
        setPersistente(null);
      });
    }
  }, []);

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

  return (
    <main class={styles.main}>
      <section class={styles.hero}>
        <span class={styles.eyebrow}>CONFIGURAÇÕES • GERAL</span>
        <h1>DO SEU JEITO.</h1>
        <p>Preferências de cobrança, segurança dos dados e ajustes da plataforma vivem aqui.</p>
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
              placeholder="CPF, e-mail, telefone ou aleatória"
            />
          </label>
          <button class={styles.button} type="submit" disabled={processando}>
            SALVAR CONFIGURAÇÃO
          </button>
        </form>

        <section class={`${styles.panel} ${styles.warningPanel}`}>
          <div class={styles.panelTitle}>
            <span>02</span>
            <h2>DADOS LOCAIS</h2>
          </div>
          <p>
            Seus dados estão neste navegador. Apagar os dados do site, trocar de
            aparelho ou mudar o endereço da aplicação pode eliminar o histórico.
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
          <p>
            Exportação, importação e lembrete quinzenal de backup serão
            adicionados aqui na Etapa 4.
          </p>
        </section>
      </div>
    </main>
  );
}
