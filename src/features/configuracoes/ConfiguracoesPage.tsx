import type { JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import {
  backupRepository,
  configuracoesRepository
} from "../../database/repositories";
import {
  aguardarConfirmacaoLicenca,
  criarCheckoutLicenca,
  pagamentoConfigurado,
  restaurarLicenca
} from "../../monetization/api";
import type {
  EstadoLicenca,
  PlanoAplicacao
} from "../../monetization/contracts";
import {
  ativarLicencaLocal,
  limparCheckoutPendente,
  registrarCheckoutPendente
} from "../../monetization/licenseService";
import {
  temasAplicacao,
  type TemaAplicacao
} from "../../theme/registry";
import styles from "../shared/Management.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

type ConfiguracoesPageProps = {
  plano?: PlanoAplicacao;
  estadoLicenca?: EstadoLicenca | null;
  online?: boolean;
  tema?: TemaAplicacao;
  onTemaChange?: (tema: TemaAplicacao) => void;
  onLicenseChange?: () => void;
  onBackupStatusChange?: (pendente: boolean) => void;
};

export function ConfiguracoesPage({
  plano = "GRATUITO",
  estadoLicenca = null,
  online = true,
  tema = "IMPACTO",
  onTemaChange,
  onLicenseChange,
  onBackupStatusChange
}: ConfiguracoesPageProps) {
  const [chavePix, setChavePix] = useState("");
  const [validarEstoque, setValidarEstoque] = useState(false);
  const [temaSelecionado, setTemaSelecionado] = useState<TemaAplicacao>(tema);
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const [backupPendente, setBackupPendente] = useState(false);
  const [arquivoImportacao, setArquivoImportacao] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [confirmouSubstituicao, setConfirmouSubstituicao] = useState(false);
  const [codigoRestauracao, setCodigoRestauracao] = useState("");
  const [sessaoPendente, setSessaoPendente] = useState(
    estadoLicenca?.pagamento_pendente?.sessao_id ?? ""
  );
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const retornoPagamentoProcessado = useRef(false);

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
      configuracoesRepository.obterValidacaoEstoque().then(setValidarEstoque),
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

  useEffect(() => {
    setSessaoPendente(estadoLicenca?.pagamento_pendente?.sessao_id ?? "");
    if (estadoLicenca?.licenca?.token_restauracao) {
      setCodigoRestauracao(estadoLicenca.licenca.token_restauracao);
    }
  }, [estadoLicenca]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const retorno = url.searchParams.get("pagamento");
    if (retornoPagamentoProcessado.current || !retorno) return;
    if (retorno === "falha") {
      retornoPagamentoProcessado.current = true;
      url.searchParams.delete("pagamento");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      void limparCheckoutPendente();
      setSessaoPendente("");
      setErro("O pagamento não foi concluído.");
      return;
    }
    if (
      !sessaoPendente ||
      (retorno !== "sucesso" && retorno !== "pendente")
    ) {
      return;
    }
    retornoPagamentoProcessado.current = true;
    url.searchParams.delete("pagamento");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    void verificarPagamento();
  }, [sessaoPendente]);

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

  async function ativarLicencaRecebida(
    licenca: NonNullable<EstadoLicenca["licenca"]>
  ) {
    await ativarLicencaLocal(licenca);
    setSessaoPendente("");
    setCodigoRestauracao(licenca.token_restauracao);
    setSucesso("Licença sem anúncios ativada neste dispositivo.");
    onLicenseChange?.();
  }

  async function iniciarPagamento() {
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (!online) throw new Error("Conecte-se à internet para iniciar o pagamento.");
      const checkout = await criarCheckoutLicenca(crypto.randomUUID());
      await registrarCheckoutPendente(checkout);
      setSessaoPendente(checkout.sessao_id);
      window.location.assign(checkout.checkout_url);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
      setProcessando(false);
    }
  }

  async function verificarPagamento() {
    if (!sessaoPendente) return;
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (!online) throw new Error("Conecte-se à internet para verificar o pagamento.");
      const resultado = await aguardarConfirmacaoLicenca(sessaoPendente);
      if (resultado.status === "APROVADA") {
        await ativarLicencaRecebida(resultado.licenca);
      } else if (resultado.status === "RECUSADA") {
        await limparCheckoutPendente();
        setSessaoPendente("");
        setErro("O pagamento foi recusado ou cancelado.");
      } else {
        setSucesso("Pagamento ainda pendente. Você pode verificar novamente.");
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function enviarRestauracao(
    event: JSX.TargetedSubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (!online) throw new Error("Conecte-se à internet para restaurar a licença.");
      const licenca = await restaurarLicenca(codigoRestauracao);
      await ativarLicencaRecebida(licenca);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function copiarCodigoLicenca() {
    try {
      await navigator.clipboard.writeText(codigoRestauracao);
      setSucesso("Código de restauração copiado.");
    } catch {
      setErro("Não foi possível copiar. Selecione o código manualmente.");
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

        <form class={styles.panel} onSubmit={salvarEstoque}>
          <div class={styles.panelTitle}>
            <span>03</span>
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

        <form class={styles.panel} onSubmit={salvarTema}>
          <div class={styles.panelTitle}>
            <span>04</span>
            <h2>APARÊNCIA</h2>
          </div>
          <p>
            Escolha o estilo visual mais confortável. A preferência fica salva
            neste dispositivo e também entra no backup.
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

        <section
          class={`${styles.panel} ${styles.widePanel} ${
            backupPendente ? styles.dangerPanel : ""
          }`}
        >
          <div class={styles.panelTitle}>
            <span>05</span>
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

        <section class={styles.panel}>
          <div class={styles.panelTitle}>
            <span>06</span>
            <h2>PLANO DA APLICAÇÃO</h2>
          </div>
          <p>
            A versão gratuita pode exibir publicidade somente quando houver
            internet. Nenhum dado comercial é enviado ao provedor de anúncios.
          </p>
          <span class={styles.tag}>
            {(estadoLicenca?.plano ?? plano) === "SEM_ANUNCIOS"
              ? "LICENÇA SEM ANÚNCIOS ATIVA"
              : "VERSÃO GRATUITA COM ANÚNCIOS"}
          </span>
          {(estadoLicenca?.plano ?? plano) === "SEM_ANUNCIOS" ? (
            <div class={styles.licenseArea}>
              <p>
                Guarde este código junto do backup para restaurar a licença em
                outro dispositivo.
              </p>
              <label htmlFor="license-code-active">
                CÓDIGO DE RESTAURAÇÃO
                <textarea
                  id="license-code-active"
                  value={codigoRestauracao}
                  readOnly
                  rows={3}
                />
              </label>
              <button
                class={styles.secondaryButton}
                type="button"
                onClick={copiarCodigoLicenca}
              >
                COPIAR CÓDIGO
              </button>
            </div>
          ) : (
            <>
              <p>
                Remova os anúncios permanentemente com um pagamento único
                simbólico de R$ 5,00 pelo Mercado Pago.
              </p>
              {!pagamentoConfigurado() && (
                <span class={styles.tag}>PAGAMENTO AINDA NÃO CONFIGURADO</span>
              )}
              {!online && (
                <span class={styles.tag}>CONEXÃO NECESSÁRIA PARA PAGAR OU RESTAURAR</span>
              )}
              {sessaoPendente ? (
                <button
                  class={styles.button}
                  type="button"
                  onClick={() => void verificarPagamento()}
                  disabled={processando || !online || !pagamentoConfigurado()}
                >
                  {processando ? "VERIFICANDO..." : "VERIFICAR PAGAMENTO"}
                </button>
              ) : (
                <button
                  class={styles.button}
                  type="button"
                  onClick={iniciarPagamento}
                  disabled={processando || !online || !pagamentoConfigurado()}
                >
                  REMOVER ANÚNCIOS POR R$ 5,00
                </button>
              )}
              <form class={styles.licenseArea} onSubmit={enviarRestauracao}>
                <h3>JÁ PAGOU EM OUTRO DISPOSITIVO?</h3>
                <label htmlFor="license-restore-code">
                  CÓDIGO DE RESTAURAÇÃO
                  <textarea
                    id="license-restore-code"
                    value={codigoRestauracao}
                    onInput={(event) =>
                      setCodigoRestauracao(event.currentTarget.value)
                    }
                    rows={3}
                    required
                  />
                </label>
                <button
                  class={styles.secondaryButton}
                  type="submit"
                  disabled={
                    processando ||
                    !online ||
                    !pagamentoConfigurado() ||
                    codigoRestauracao.trim().length < 16
                  }
                >
                  RESTAURAR LICENÇA
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
