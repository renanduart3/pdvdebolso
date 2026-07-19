import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { formatarCentavos, parsePrecoParaCentavos } from "../../database/money";
import {
  catalogoRepository,
  clientesRepository,
  configuracoesRepository,
  transacoesRepository
} from "../../database/repositories";
import type { ContaReceber } from "../../database/repositories/transacoesRepository";
import type {
  Cliente,
  ItemTransacao,
  MetodoPagamento,
  ProdutoCatalogo
} from "../../database/types";
import { filtrarDecimal } from "../shared/numericInput";
import { criarLinkCobrancaWhatsApp } from "./whatsapp";
import styles from "./FiadoPage.module.css";

type FiadoPageProps = { onDataChange?: () => void };
type ModoEntrada = "ITENS" | "AVULSO";

function obterMensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Algo deu errado. Tente novamente.";
}

function formatarData(data: string | null): string {
  if (!data) return "SEM DATA";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${data}T12:00:00`));
}

function dataPadraoFiado(): string {
  const data = new Date();
  data.setDate(data.getDate() + 7);
  return data.toISOString().slice(0, 10);
}

export function FiadoPage({ onDataChange }: FiadoPageProps) {
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [chavePix, setChavePix] = useState("");
  const [modoEntrada, setModoEntrada] = useState<ModoEntrada>("ITENS");
  const [clienteId, setClienteId] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [sugestoesClientes, setSugestoesClientes] = useState<Cliente[]>([]);
  const [vencimento, setVencimento] = useState(dataPadraoFiado);
  const [descricao, setDescricao] = useState("");
  const [valorAvulso, setValorAvulso] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [sugestoes, setSugestoes] = useState<ProdutoCatalogo[]>([]);
  const [produtosSelecionados, setProdutosSelecionados] = useState<ProdutoCatalogo[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [vendaEmEdicao, setVendaEmEdicao] = useState<string | null>(null);
  const [vendaEmPagamento, setVendaEmPagamento] = useState<string | null>(null);
  const [vendaEmExclusao, setVendaEmExclusao] = useState<ContaReceber | null>(null);
  const [valorPagamento, setValorPagamento] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>("PIX");
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

  useEffect(() => {
    let ativo = true;
    const termo = buscaItem.trim();
    if (!termo) {
      setSugestoes([]);
      return;
    }
    const timer = window.setTimeout(() => {
      catalogoRepository
        .listarPagina({ busca: termo, tamanho: 6 })
        .then((pagina) => {
          if (ativo) setSugestoes(pagina.itens);
        })
        .catch((error: unknown) => {
          if (ativo) setErro(obterMensagemErro(error));
        });
    }, 150);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [buscaItem]);

  useEffect(() => {
    let ativo = true;
    const termo = buscaCliente.trim();
    if (!termo || clienteSelecionado) {
      setSugestoesClientes([]);
      return;
    }
    const timer = window.setTimeout(() => {
      clientesRepository
        .listarPagina({ busca: termo, tamanho: 6 })
        .then((pagina) => {
          if (ativo) setSugestoesClientes(pagina.itens);
        })
        .catch((error: unknown) => {
          if (ativo) setErro(obterMensagemErro(error));
        });
    }, 150);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [buscaCliente, clienteSelecionado]);

  const itensEntrada = useMemo<ItemTransacao[]>(() => {
    if (modoEntrada === "AVULSO") {
      if (!valorAvulso.trim()) return [];
      try {
        return [{
          id_produto: null,
          nome_produto: descricao.trim() || "LANÇAMENTO AVULSO",
          quantidade: 1,
          preco_unitario_centavos: parsePrecoParaCentavos(valorAvulso)
        }];
      } catch {
        return [];
      }
    }
    return produtosSelecionados.flatMap((produto) => {
      const quantidade = quantidades[produto.id] ?? 0;
      return quantidade > 0
        ? [{
            id_produto: produto.id,
            nome_produto: produto.nome,
            quantidade,
            preco_unitario_centavos: produto.preco_padrao_centavos
          }]
        : [];
    });
  }, [descricao, modoEntrada, produtosSelecionados, quantidades, valorAvulso]);

  const totalEntrada = useMemo(
    () =>
      itensEntrada.reduce(
        (total, item) => total + item.quantidade * item.preco_unitario_centavos,
        0
      ),
    [itensEntrada]
  );
  const totalPendente = useMemo(
    () => contas.reduce((total, conta) => total + conta.saldo_centavos, 0),
    [contas]
  );
  const clientesComDivida = useMemo(
    () => new Set(contas.map((conta) => conta.cliente.id)).size,
    [contas]
  );

  function adicionarItem(produto: ProdutoCatalogo) {
    setProdutosSelecionados((itens) =>
      itens.some((item) => item.id === produto.id) ? itens : [...itens, produto]
    );
    setQuantidades((itens) => ({
      ...itens,
      [produto.id]: (itens[produto.id] ?? 0) + 1
    }));
    setBuscaItem("");
    setSugestoes([]);
  }

  function limparEntrada() {
    setVendaEmEdicao(null);
    setModoEntrada("ITENS");
    setClienteId("");
    setClienteSelecionado(null);
    setBuscaCliente("");
    setSugestoesClientes([]);
    setVencimento(dataPadraoFiado());
    setDescricao("");
    setValorAvulso("");
    setBuscaItem("");
    setProdutosSelecionados([]);
    setQuantidades({});
  }

  function selecionarCliente(cliente: Cliente) {
    setClienteId(cliente.id);
    setClienteSelecionado(cliente);
    setBuscaCliente(cliente.nome);
    setSugestoesClientes([]);
  }

  function limparCliente() {
    setClienteId("");
    setClienteSelecionado(null);
    setBuscaCliente("");
    setSugestoesClientes([]);
  }

  async function salvarFiado(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      if (itensEntrada.length === 0) {
        throw new TypeError(
          modoEntrada === "AVULSO"
            ? "Informe um valor avulso válido."
            : "Adicione pelo menos um item."
        );
      }
      const input = {
        itens: itensEntrada,
        cliente_id: clienteId,
        data_vencimento: vencimento,
        descricao
      };
      const editando = vendaEmEdicao;
      const venda = editando
        ? await transacoesRepository.corrigirVendaFiada(editando, input)
        : await transacoesRepository.registrarVendaFiada(input);
      limparEntrada();
      await carregarDados();
      setSucesso(
        `Fiado de ${formatarCentavos(venda.valor_total_centavos)} ${editando ? "corrigido" : "registrado"}.`
      );
      onDataChange?.();
    } catch (error: unknown) {
      setErro(obterMensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function editarFiado(conta: ContaReceber) {
    setErro(null);
    if (conta.valor_pago_centavos > 0) {
      setErro("Fiados com pagamentos não podem ser editados.");
      return;
    }
    setVendaEmEdicao(conta.venda.id);
    setClienteId(conta.cliente.id);
    setClienteSelecionado(conta.cliente);
    setBuscaCliente(conta.cliente.nome);
    setVencimento(conta.venda.data_vencimento ?? dataPadraoFiado());
    setDescricao(conta.venda.descricao ?? "");
    const avulso = conta.venda.itens.every((item) => item.id_produto === null);
    setModoEntrada(avulso ? "AVULSO" : "ITENS");
    if (avulso) {
      setValorAvulso(
        (conta.venda.valor_total_centavos / 100).toFixed(2).replace(".", ",")
      );
      setProdutosSelecionados([]);
      setQuantidades({});
    } else {
      const catalogo = await catalogoRepository.listarTodos();
      const ids = new Set(
        conta.venda.itens.flatMap((item) => (item.id_produto ? [item.id_produto] : []))
      );
      setProdutosSelecionados(catalogo.filter((item) => ids.has(item.id)));
      setQuantidades(
        Object.fromEntries(
          conta.venda.itens.flatMap((item) =>
            item.id_produto ? [[item.id_produto, item.quantidade]] : []
          )
        )
      );
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluirFiado(conta: ContaReceber) {
    setProcessando(true);
    setErro(null);
    try {
      await transacoesRepository.cancelarVenda(
        conta.venda.id,
        "Fiado excluído pelo usuário"
      );
      setVendaEmExclusao(null);
      await carregarDados();
      setSucesso(`Fiado de ${conta.cliente.nome} foi cancelado.`);
      onDataChange?.();
    } catch (error: unknown) {
      setErro(obterMensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function registrarPagamento(
    event: JSX.TargetedSubmitEvent<HTMLFormElement>,
    conta: ContaReceber
  ) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    try {
      const valorCentavos = parsePrecoParaCentavos(valorPagamento);
      await transacoesRepository.registrarPagamentoFiado({
        venda_id: conta.venda.id,
        valor_centavos: valorCentavos,
        metodo_pagamento: metodoPagamento
      });
      await carregarDados();
      setVendaEmPagamento(null);
      setValorPagamento("");
      setSucesso(`Pagamento de ${formatarCentavos(valorCentavos)} registrado para ${conta.cliente.nome}.`);
      onDataChange?.();
    } catch (error: unknown) {
      setErro(obterMensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  function abrirPagamento(conta: ContaReceber) {
    setVendaEmPagamento((atual) => atual === conta.venda.id ? null : conta.venda.id);
    setValorPagamento((conta.saldo_centavos / 100).toFixed(2).replace(".", ","));
    setMetodoPagamento("PIX");
  }

  return (
    <main class={styles.main}>
      <section class={styles.hero} aria-labelledby="fiado-title">
        <div><span class={styles.eyebrow}>CONTAS A RECEBER</span><h1 id="fiado-title">FIADO SOB CONTROLE.</h1><p>Registre a dívida, cobre e dê baixa sem perder o histórico.</p></div>
        <article class={styles.debtCard}><span>TOTAL PENDENTE</span><strong>{formatarCentavos(totalPendente)}</strong><small>{clientesComDivida} {clientesComDivida === 1 ? "CLIENTE" : "CLIENTES"}</small></article>
      </section>
      {erro && <div class={`${styles.notice} ${styles.errorNotice}`} role="alert"><strong>ATENÇÃO:</strong> {erro}<button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">×</button></div>}
      {sucesso && <div class={`${styles.notice} ${styles.successNotice}`} role="status"><strong>PRONTO:</strong> {sucesso}<button type="button" onClick={() => setSucesso(null)} aria-label="Fechar mensagem">×</button></div>}

      <form class={styles.entrySection} onSubmit={salvarFiado}>
        <div class={styles.accountsHeader}><div><span class={styles.step}>01</span><h2>{vendaEmEdicao ? "CORRIGIR FIADO" : "NOVO FIADO"}</h2></div>{vendaEmEdicao && <button class={styles.cancelEdit} type="button" onClick={limparEntrada}>CANCELAR EDIÇÃO</button>}</div>
        <div class={styles.entryGrid}>
          <div class={styles.clientPicker}>
            <label>BUSCAR CLIENTE<input type="search" value={buscaCliente} onInput={(event) => { setBuscaCliente(event.currentTarget.value); if (clienteSelecionado) { setClienteSelecionado(null); setClienteId(""); } }} placeholder="Início do nome" autoComplete="off" required={!clienteId} /></label>
            {sugestoesClientes.length > 0 && (
              <ul class={styles.clientSuggestions}>
                {sugestoesClientes.map((cliente) => (
                  <li key={cliente.id}>
                    <button type="button" onClick={() => selecionarCliente(cliente)} aria-label={`Selecionar ${cliente.nome}`}>
                      <strong>{cliente.nome}</strong>
                      <span>{cliente.telefone ?? "SEM TELEFONE"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {buscaCliente.trim() && !clienteSelecionado && sugestoesClientes.length === 0 && (
              <small class={styles.clientHint}>DIGITE O INÍCIO DO NOME E SELECIONE NA LISTA.</small>
            )}
            {clienteSelecionado && (
              <div class={styles.selectedClient}>
                <span><strong>{clienteSelecionado.nome}</strong><small>CLIENTE SELECIONADO</small></span>
                <button type="button" onClick={limparCliente} aria-label={`Remover ${clienteSelecionado.nome}`}>×</button>
              </div>
            )}
          </div>
          <label>VENCIMENTO<input type="date" value={vencimento} onInput={(event) => setVencimento(event.currentTarget.value)} required /></label>
          <label class={styles.descriptionField}>DESCRIÇÃO<input value={descricao} onInput={(event) => setDescricao(event.currentTarget.value)} maxLength={160} placeholder="Ex.: compra da semana" /></label>
        </div>
        <div class={styles.modeChoice}>
          <button type="button" class={modoEntrada === "ITENS" ? styles.modeActive : undefined} onClick={() => setModoEntrada("ITENS")}>SELECIONAR ITENS</button>
          <button type="button" class={modoEntrada === "AVULSO" ? styles.modeActive : undefined} onClick={() => setModoEntrada("AVULSO")}>VALOR AVULSO</button>
        </div>
        {modoEntrada === "AVULSO" ? (
          <label class={styles.avulsoField}>VALOR AVULSO<div class={styles.moneyInput}><span>R$</span><input aria-label="VALOR AVULSO" value={valorAvulso} onInput={(event) => setValorAvulso(filtrarDecimal(event.currentTarget.value))} inputMode="decimal" placeholder="0,00" required /></div></label>
        ) : (
          <div class={styles.itemPicker}>
            <label>BUSCAR ITEM<input type="search" value={buscaItem} onInput={(event) => setBuscaItem(event.currentTarget.value)} placeholder="Início do nome" /></label>
            {sugestoes.length > 0 && <ul class={styles.itemSuggestions}>{sugestoes.map((produto) => <li key={produto.id}><button type="button" onClick={() => adicionarItem(produto)}><span>{produto.nome}</span><strong>{formatarCentavos(produto.preco_padrao_centavos)}</strong></button></li>)}</ul>}
            {produtosSelecionados.length > 0 && <ul class={styles.selectedItems}>{produtosSelecionados.map((produto) => <li key={produto.id}><span>{produto.nome}</span><div><button type="button" onClick={() => setQuantidades((itens) => ({ ...itens, [produto.id]: Math.max(0, (itens[produto.id] ?? 0) - 1) }))}>−</button><strong>{quantidades[produto.id] ?? 0}</strong><button type="button" onClick={() => setQuantidades((itens) => ({ ...itens, [produto.id]: (itens[produto.id] ?? 0) + 1 }))}>+</button></div></li>)}</ul>}
          </div>
        )}
        <div class={styles.entryFooter}><span>TOTAL: <strong>{formatarCentavos(totalEntrada)}</strong></span><button type="submit" disabled={processando || !clienteId}>{processando ? "SALVANDO..." : vendaEmEdicao ? "SALVAR CORREÇÃO" : "REGISTRAR FIADO"}</button></div>
      </form>

      <section class={styles.accountsSection} aria-labelledby="accounts-title">
        <div class={styles.accountsHeader}><div><span class={styles.step}>02</span><h2 id="accounts-title">QUEM ESTÁ DEVENDO</h2></div><span class={styles.orderTag}>ATRASO → VALOR</span></div>
        {carregando ? <div class={styles.emptyState} role="status"><strong>CALCULANDO OS SALDOS...</strong></div> : contas.length === 0 ? <div class={styles.emptyState}><strong>NENHUMA CONTA PENDENTE.</strong><span>Use o formulário acima para registrar um fiado.</span></div> : (
          <ul class={styles.accountsList}>
            {contas.map((conta) => {
              const linkWhatsApp = conta.cliente.telefone && conta.cliente.telefone_whatsapp
                ? criarLinkCobrancaWhatsApp({ telefone: conta.cliente.telefone, nomeCliente: conta.cliente.nome, saldoCentavos: conta.saldo_centavos, chavePix })
                : null;
              return (
                <li key={conta.venda.id} class={styles.accountCard}>
                  <div class={styles.accountTop}><div><span class={`${styles.statusTag} ${conta.status_atual === "PARCIAL" ? styles.partialTag : styles.fiadoTag}`}>{conta.status_atual}</span><h3>{conta.cliente.nome}</h3><p>{conta.venda.descricao || conta.venda.itens.map((item) => item.nome_produto).join(", ")}</p><p>VENCE EM {formatarData(conta.venda.data_vencimento)}{conta.dias_atraso > 0 ? ` • ${conta.dias_atraso} DIAS DE ATRASO` : " • EM DIA"}</p></div><div class={styles.balance}><span>SALDO</span><strong>{formatarCentavos(conta.saldo_centavos)}</strong>{conta.valor_pago_centavos > 0 && <small>PAGO: {formatarCentavos(conta.valor_pago_centavos)}</small>}</div></div>
                  <div class={styles.accountActions}>
                    {linkWhatsApp ? <a href={linkWhatsApp} target="_blank" rel="noopener noreferrer">COBRAR VIA WHATSAPP ↗</a> : <span class={styles.noPhone}>SEM WHATSAPP</span>}
                    <button type="button" onClick={() => abrirPagamento(conta)}>{vendaEmPagamento === conta.venda.id ? "CANCELAR BAIXA" : "REGISTRAR PAGAMENTO"}</button>
                    <button type="button" onClick={() => editarFiado(conta)} disabled={conta.valor_pago_centavos > 0}>EDITAR FIADO</button>
                    <button class={styles.deleteDebt} type="button" onClick={() => setVendaEmExclusao(conta)}>EXCLUIR FIADO</button>
                  </div>
                  {vendaEmPagamento === conta.venda.id && (
                    <form class={styles.paymentForm} onSubmit={(event) => registrarPagamento(event, conta)}>
                      <label>VALOR RECEBIDO<div class={styles.moneyInput}><span>R$</span><input value={valorPagamento} onInput={(event) => setValorPagamento(filtrarDecimal(event.currentTarget.value))} inputMode="decimal" required autoFocus /></div></label>
                      <label>RECEBIDO POR<select value={metodoPagamento} onChange={(event) => setMetodoPagamento(event.currentTarget.value as MetodoPagamento)}><option value="PIX">PIX</option><option value="DINHEIRO">DINHEIRO</option><option value="CARTAO">CARTÃO</option></select></label>
                      <button type="submit" disabled={processando}>{processando ? "REGISTRANDO..." : "CONFIRMAR BAIXA"}</button>
                    </form>
                  )}
                  {vendaEmExclusao?.venda.id === conta.venda.id && (
                    <div class={styles.confirmDelete} role="alertdialog" aria-label={`Confirmar exclusão do fiado de ${conta.cliente.nome}`}>
                      <strong>EXCLUIR ESTE FIADO?</strong><span>O lançamento será cancelado, o estoque restaurado e o histórico mantido para auditoria.</span>
                      <div><button type="button" onClick={() => setVendaEmExclusao(null)}>VOLTAR</button><button type="button" onClick={() => excluirFiado(conta)} disabled={processando}>CONFIRMAR EXCLUSÃO</button></div>
                    </div>
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
