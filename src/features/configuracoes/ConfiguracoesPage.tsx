import type { JSX } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";

import {
  backupRepository,
  configuracoesRepository
} from "../../database/repositories";
import styles from "../shared/Management.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

type ConfiguracoesPageProps = {
  onBackupStatusChange?: (pendente: boolean) => void;
};

export function ConfiguracoesPage({
  onBackupStatusChange
}: ConfiguracoesPageProps) {
  const [chavePix, setChavePix] = useState("");
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const [backupPendente, setBackupPendente] = useState(false);
  const [arquivoImportacao, setArquivoImportacao] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [confirmouSubstituicao, setConfirmouSubstituicao] = useState(false);
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
    Promise.all([
      configuracoesRepository.obterChavePix().then(setChavePix),
      carregarBackup()
    ]).catch((error: unknown) => setErro(mensagemErro(error)));

    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setPersistente).catch(() => {
        setPersistente(null);
      });
    }
  }, [carregarBackup]);

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

  async function exportarBackup() {
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const exportado = await backupRepository.exportar();
      const blob = new Blob([exportado.conteudo], {
        type: "application/json;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportado.nome_arquivo;
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setUltimoBackup(exportado.exportado_em);
      setBackupPendente(false);
      setSucesso("Backup gerado. Guarde o arquivo em um lugar seguro.");
      onBackupStatusChange?.(false);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function selecionarArquivo(
    event: JSX.TargetedEvent<HTMLInputElement, Event>
  ) {
    const arquivo = event.currentTarget.files?.[0];
    setArquivoImportacao(null);
    setNomeArquivo("");
    setConfirmouSubstituicao(false);
    if (!arquivo) return;

    try {
      setArquivoImportacao(await arquivo.text());
      setNomeArquivo(arquivo.name);
    } catch {
      setErro("Não foi possível ler o arquivo selecionado.");
    }
  }

  async function importarBackup() {
    if (!arquivoImportacao || !confirmouSubstituicao) return;
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const importado = await backupRepository.importar(arquivoImportacao);
      setChavePix(await configuracoesRepository.obterChavePix());
      const pendente = await carregarBackup();
      setArquivoImportacao(null);
      setNomeArquivo("");
      setConfirmouSubstituicao(false);
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
        </section>

        <section
          class={`${styles.panel} ${styles.widePanel} ${
            backupPendente ? styles.dangerPanel : ""
          }`}
        >
          <div class={styles.panelTitle}>
            <span>03</span>
            <h2>BACKUP E RESTAURAÇÃO</h2>
          </div>
          <p>
            Exporte clientes, catálogo, transações e configurações para um
            arquivo JSON. Faça isso pelo menos a cada 14 dias.
          </p>
          <span class={styles.tag}>
            {ultimoBackup
              ? `ÚLTIMO BACKUP: ${new Intl.DateTimeFormat("pt-BR").format(
                  new Date(ultimoBackup)
                )}`
              : "NENHUM BACKUP REGISTRADO"}
          </span>
          {backupPendente && (
            <p class={styles.dangerText}>
              BACKUP PENDENTE: SE O NAVEGADOR FOR LIMPO, SEUS DADOS PODEM SER
              PERDIDOS.
            </p>
          )}
          <button
            class={styles.button}
            type="button"
            onClick={exportarBackup}
            disabled={processando}
          >
            {processando ? "PROCESSANDO..." : "EXPORTAR BANCO DE DADOS"}
          </button>

          <div class={styles.importArea}>
            <h3>RESTAURAR UM BACKUP</h3>
            <p>
              A restauração valida o arquivo primeiro e depois substitui todos
              os dados atuais em uma única operação.
            </p>
            <label htmlFor="backup-file">
              ARQUIVO JSON
              <input
                id="backup-file"
                class={styles.fileInput}
                type="file"
                accept="application/json,.json"
                onChange={selecionarArquivo}
              />
            </label>
            {nomeArquivo && <span class={styles.tag}>{nomeArquivo}</span>}
            <label class={styles.checkLabel}>
              <input
                type="checkbox"
                checked={confirmouSubstituicao}
                onChange={(event) =>
                  setConfirmouSubstituicao(event.currentTarget.checked)
                }
                disabled={!arquivoImportacao}
              />
              CONFIRMO QUE O BACKUP SUBSTITUIRÁ OS DADOS ATUAIS
            </label>
            <button
              class={styles.secondaryButton}
              type="button"
              onClick={importarBackup}
              disabled={
                processando ||
                !arquivoImportacao ||
                !confirmouSubstituicao
              }
            >
              IMPORTAR E SUBSTITUIR
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
