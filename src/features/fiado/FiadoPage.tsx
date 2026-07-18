import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { parsePrecoParaCentavos, formatarCentavos } from "../../database/money";
import {
  configuracoesRepository,
  transacoesRepository
} from "../../database/repositories";
import type { ContaReceber } from "../../database/repositories/transacoesRepository";
import type { MetodoPagamento } from "../../database/types";
import { criarLinkCobrancaWhatsApp } from "./whatsapp";
import styles from "./FiadoPage.module.css";

function obterMensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Algo deu errado. Tente novamente.";
}

function formatarData(data: string | null): string {
  if (!data) return "SEM DATA";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${data}T12:00:00`));
}

export function FiadoPage() {
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [chavePix, setChavePix] = useState("");
  const [vendaEmPagamento, setVendaEmPagamento] = useState<string | null>(null);
  const [valorPagamento, setValorPagamento] = useState("");
  const [metodoPagamento, setMetodoPagamento] =
    useState<MetodoPagamento>("PIX");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    const [contasAReceber, pix] = await Promise.all([
      transacoesRepository.listarContasAReceber(),
      configuracoesRepository.obterChavePix()
    ]);

    setContas(contasAReceber);
    setChavePix(pix);
  }, []);

  useEffect(() => {
    let ativo = true;

    carregarDados()
      .catch((error: unknown) => {
        if (ativo) setErro(obterMensagemErro(error));
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [carregarDados]);

  const totalPendente = useMemo(
    () => contas.reduce((total, conta) => total + conta.saldo_centavos, 0),
    [contas]
  );

  const clientesComDivida = useMemo(
    () => new Set(contas.map((conta) => conta.cliente.id)).size,
    [contas]
  );

  async function registrarPagamento(
    event: JSX.TargetedSubmitEvent<HTMLFormElement>,
    conta: ContaReceber
  ) {
    event.preventDefault();
    setErro(null);
    setSucesso(null);
    setProcessando(true);

    try {
      const valorCentavos = parsePrecoParaCentavos(valorPagamento);
      await transacoesRepository.registrarPagamentoFiado({
        venda_id: conta.venda.id,
        valor_centavos: valorCentavos,
        metodo_pagamento: metodoPagamento
      });
      setContas(await transacoesRepository.listarContasAReceber());
      setVendaEmPagamento(null);
      setValorPagamento("");
      setSucesso(
        `Pagamento de ${formatarCentavos(valorCentavos)} registrado para ${conta.cliente.nome}.`
      );
    } catch (error: unknown) {
      setErro(obterMensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  function abrirPagamento(conta: ContaReceber) {
    setVendaEmPagamento((atual) =>
      atual === conta.venda.id ? null : conta.venda.id
    );
    setValorPagamento(
      (conta.saldo_centavos / 100).toFixed(2).replace(".", ",")
    );
    setMetodoPagamento("PIX");
    setErro(null);
  }

  return (
    <main class={styles.main}>
      <section class={styles.hero} aria-labelledby="fiado-title">
        <div>
          <span class={styles.eyebrow}>CONTAS A RECEBER • ETAPA 03</span>
          <h1 id="fiado-title">FIADO SOB CONTROLE.</h1>
          <p>Cobre sem constrangimento e registre cada baixa. Sem misturar cadastros.</p>
        </div>
        <article class={styles.debtCard}>
          <span>TOTAL PENDENTE</span>
          <strong>{formatarCentavos(totalPendente)}</strong>
          <small>
            {clientesComDivida} {clientesComDivida === 1 ? "CLIENTE" : "CLIENTES"}
          </small>
        </article>
      </section>

      {erro && (
        <div class={`${styles.notice} ${styles.errorNotice}`} role="alert">
          <strong>ATENÇÃO:</strong> {erro}
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">
            ×
          </button>
        </div>
      )}
      {sucesso && (
        <div class={`${styles.notice} ${styles.successNotice}`} role="status">
          <strong>PRONTO:</strong> {sucesso}
          <button
            type="button"
            onClick={() => setSucesso(null)}
            aria-label="Fechar mensagem"
          >
            ×
          </button>
        </div>
      )}

      <section class={styles.accountsSection} aria-labelledby="accounts-title">
        <div class={styles.accountsHeader}>
          <div>
            <span class={styles.step}>01</span>
            <h2 id="accounts-title">QUEM ESTÁ DEVENDO</h2>
          </div>
          <span class={styles.orderTag}>ATRASO → VALOR</span>
        </div>

        {carregando ? (
          <div class={styles.emptyState} role="status">
            <strong>CALCULANDO OS SALDOS...</strong>
          </div>
        ) : contas.length === 0 ? (
          <div class={styles.emptyState}>
            <strong>NENHUMA CONTA PENDENTE.</strong>
            <span>Quando uma venda fiada for feita, ela aparece aqui.</span>
          </div>
        ) : (
          <ul class={styles.accountsList}>
            {contas.map((conta) => {
              const linkWhatsApp = conta.cliente.telefone
                ? criarLinkCobrancaWhatsApp({
                    telefone: conta.cliente.telefone,
                    nomeCliente: conta.cliente.nome,
                    saldoCentavos: conta.saldo_centavos,
                    chavePix
                  })
                : null;

              return (
                <li key={conta.venda.id} class={styles.accountCard}>
                  <div class={styles.accountTop}>
                    <div>
                      <span
                        class={`${styles.statusTag} ${
                          conta.status_atual === "PARCIAL"
                            ? styles.partialTag
                            : styles.fiadoTag
                        }`}
                      >
                        {conta.status_atual}
                      </span>
                      <h3>{conta.cliente.nome}</h3>
                      <p>
                        VENCEU EM {formatarData(conta.venda.data_vencimento)}
                        {conta.dias_atraso > 0
                          ? ` • ${conta.dias_atraso} DIAS DE ATRASO`
                          : " • EM DIA"}
                      </p>
                    </div>
                    <div class={styles.balance}>
                      <span>SALDO</span>
                      <strong>{formatarCentavos(conta.saldo_centavos)}</strong>
                      {conta.valor_pago_centavos > 0 && (
                        <small>
                          PAGO: {formatarCentavos(conta.valor_pago_centavos)}
                        </small>
                      )}
                    </div>
                  </div>

                  <div class={styles.accountActions}>
                    {linkWhatsApp ? (
                      <a href={linkWhatsApp} target="_blank" rel="noopener noreferrer">
                        COBRAR VIA WHATSAPP ↗
                      </a>
                    ) : (
                      <span class={styles.noPhone}>SEM WHATSAPP CADASTRADO</span>
                    )}
                    <button type="button" onClick={() => abrirPagamento(conta)}>
                      {vendaEmPagamento === conta.venda.id
                        ? "CANCELAR"
                        : "REGISTRAR PAGAMENTO"}
                    </button>
                  </div>

                  {vendaEmPagamento === conta.venda.id && (
                    <form
                      class={styles.paymentForm}
                      onSubmit={(event) => registrarPagamento(event, conta)}
                    >
                      <label htmlFor={`payment-value-${conta.venda.id}`}>
                        VALOR RECEBIDO
                        <div class={styles.moneyInput}>
                          <span>R$</span>
                          <input
                            id={`payment-value-${conta.venda.id}`}
                            value={valorPagamento}
                            onInput={(event) =>
                              setValorPagamento(event.currentTarget.value)
                            }
                            inputMode="decimal"
                            required
                            autoFocus
                          />
                        </div>
                      </label>
                      <label htmlFor={`payment-method-${conta.venda.id}`}>
                        RECEBIDO POR
                        <select
                          id={`payment-method-${conta.venda.id}`}
                          value={metodoPagamento}
                          onChange={(event) =>
                            setMetodoPagamento(
                              event.currentTarget.value as MetodoPagamento
                            )
                          }
                        >
                          <option value="PIX">PIX</option>
                          <option value="DINHEIRO">DINHEIRO</option>
                          <option value="CARTAO">CARTÃO</option>
                        </select>
                      </label>
                      <button type="submit" disabled={processando}>
                        {processando ? "REGISTRANDO..." : "CONFIRMAR BAIXA"}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
