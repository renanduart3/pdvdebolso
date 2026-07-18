import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { JSX } from "preact";

import {
  catalogoRepository,
  clientesRepository,
  transacoesRepository
} from "../../database/repositories";
import { formatarCentavos } from "../../database/money";
import type {
  Cliente,
  ItemTransacao,
  MetodoPagamento,
  ProdutoCatalogo
} from "../../database/types";
import type { ResumoVendas } from "../../database/repositories/transacoesRepository";
import styles from "./PdvPage.module.css";

type Carrinho = Record<string, number>;
type PdvPageProps = {
  onOpenProdutos?: () => void;
  onOpenClientes?: () => void;
};

const resumoVazio: ResumoVendas = {
  quantidade: 0,
  total_centavos: 0
};

function obterMensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Algo deu errado. Tente novamente.";
}

function dataPadraoFiado(): string {
  const data = new Date();
  data.setDate(data.getDate() + 7);
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0")
  ].join("-");
}

export function PdvPage({ onOpenProdutos, onOpenClientes }: PdvPageProps) {
  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carrinho, setCarrinho] = useState<Carrinho>({});
  const [resumo, setResumo] = useState<ResumoVendas>(resumoVazio);
  const [busca, setBusca] = useState("");
  const [mostrarFiado, setMostrarFiado] = useState(false);
  const [clienteFiadoId, setClienteFiadoId] = useState("");
  const [dataVencimento, setDataVencimento] = useState(dataPadraoFiado);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    const [catalogo, resumoDoDia, clientesCadastrados] = await Promise.all([
      catalogoRepository.listarAtivos(),
      transacoesRepository.obterResumoDoDia(),
      clientesRepository.listar()
    ]);

    setProdutos(catalogo);
    setResumo(resumoDoDia);
    setClientes(clientesCadastrados);
    setClienteFiadoId((atual) => atual || clientesCadastrados[0]?.id || "");
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

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    if (!termo) return produtos;

    return produtos.filter((produto) =>
      produto.nome.toLocaleLowerCase("pt-BR").includes(termo)
    );
  }, [busca, produtos]);

  const itensCarrinho = useMemo(
    () =>
      produtos
        .filter((produto) => carrinho[produto.id] > 0)
        .map((produto) => ({
          produto,
          quantidade: carrinho[produto.id]
        })),
    [carrinho, produtos]
  );

  const totalCarrinhoCentavos = useMemo(
    () =>
      itensCarrinho.reduce(
        (total, item) =>
          total + item.produto.preco_padrao_centavos * item.quantidade,
        0
      ),
    [itensCarrinho]
  );

  const criarItensDaVenda = useCallback(
    (): ItemTransacao[] =>
      itensCarrinho.map(({ produto, quantidade }) => ({
        id_produto: produto.id,
        nome_produto: produto.nome,
        quantidade,
        preco_unitario_centavos: produto.preco_padrao_centavos
      })),
    [itensCarrinho]
  );

  function alterarQuantidade(produtoId: string, delta: number) {
    const produto = produtos.find((item) => item.id === produtoId);
    const quantidadeAtual = carrinho[produtoId] ?? 0;
    if (
      delta > 0 &&
      produto &&
      produto.estoque_quantidade !== null &&
      quantidadeAtual >= produto.estoque_quantidade
    ) {
      setErro(`Estoque disponível de ${produto.nome}: ${produto.estoque_quantidade}.`);
      return;
    }

    setCarrinho((atual) => {
      const quantidade = Math.max(0, (atual[produtoId] ?? 0) + delta);
      const proximo = { ...atual };

      if (quantidade === 0) {
        delete proximo[produtoId];
      } else {
        proximo[produtoId] = quantidade;
      }

      return proximo;
    });
    setSucesso(null);
  }

  function aplicarBaixaEstoqueLocal() {
    const vendidos = new Map(
      itensCarrinho.map(({ produto, quantidade }) => [produto.id, quantidade])
    );
    setProdutos((atuais) =>
      atuais.map((produto) => {
        const quantidade = vendidos.get(produto.id);
        if (quantidade === undefined || produto.estoque_quantidade === null) {
          return produto;
        }
        return {
          ...produto,
          estoque_quantidade: produto.estoque_quantidade - quantidade
        };
      })
    );
  }

  async function finalizarVenda(metodoPagamento: MetodoPagamento) {
    setErro(null);
    setSucesso(null);
    setProcessando(true);

    try {
      const venda = await transacoesRepository.registrarVendaPaga({
        itens: criarItensDaVenda(),
        metodo_pagamento: metodoPagamento
      });

      aplicarBaixaEstoqueLocal();
      setCarrinho({});
      setResumo((atual) => ({
        quantidade: atual.quantidade + 1,
        total_centavos: atual.total_centavos + venda.valor_total_centavos
      }));
      setSucesso(
        `Venda de ${formatarCentavos(venda.valor_total_centavos)} registrada no ${metodoPagamento}.`
      );
    } catch (error: unknown) {
      setErro(obterMensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function finalizarVendaFiada(
    event: JSX.TargetedSubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setErro(null);
    setSucesso(null);
    setProcessando(true);

    try {
      const cliente = clientes.find((item) => item.id === clienteFiadoId);
      const venda = await transacoesRepository.registrarVendaFiada({
        itens: criarItensDaVenda(),
        cliente_id: clienteFiadoId,
        data_vencimento: dataVencimento
      });

      aplicarBaixaEstoqueLocal();
      setCarrinho({});
      setMostrarFiado(false);
      setDataVencimento(dataPadraoFiado());
      setSucesso(
        `Fiado de ${formatarCentavos(venda.valor_total_centavos)} lançado para ${cliente?.nome ?? "o cliente"}.`
      );
    } catch (error: unknown) {
      setErro(obterMensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <main class={styles.main}>
      <section class={styles.hero} aria-labelledby="pdv-title">
        <div>
          <span class={styles.eyebrow}>PDV EXPRESSO • ETAPA 03</span>
          <h1 id="pdv-title">VENDA RÁPIDA.</h1>
          <p>Escolha os produtos, ajuste as quantidades e receba. Sem enrolação.</p>
        </div>
        <article class={styles.todayCard} aria-label="Faturamento de hoje">
          <span>HOJE</span>
          <strong>{formatarCentavos(resumo.total_centavos)}</strong>
          <small>
            {resumo.quantidade} {resumo.quantidade === 1 ? "VENDA" : "VENDAS"}
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

      <div class={styles.pdvGrid}>
        <section class={styles.catalogSection} aria-labelledby="catalog-title">
          <div class={styles.sectionHeader}>
            <div>
              <span class={styles.step}>01</span>
              <h2 id="catalog-title">PRODUTOS E SERVIÇOS</h2>
            </div>
            <span class={styles.itemCount}>SÓ VENDA</span>
          </div>

          <label class={styles.searchLabel} htmlFor="catalog-search">
            <span>BUSCAR NO CATÁLOGO</span>
            <input
              id="catalog-search"
              type="search"
              value={busca}
              onInput={(event) => setBusca(event.currentTarget.value)}
              placeholder="Digite o nome..."
            />
          </label>

          {carregando ? (
            <div class={styles.emptyState} role="status">
              <strong>ABRINDO SEU CATÁLOGO...</strong>
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <div class={styles.emptyState}>
              <strong>
                {produtos.length === 0
                  ? "SEU CATÁLOGO ESTÁ VAZIO."
                  : "NENHUM PRODUTO ENCONTRADO."}
              </strong>
              <span>
                {produtos.length === 0
                  ? "Cadastre produtos ou serviços no módulo próprio."
                  : "Tente outro termo de busca."}
              </span>
              {produtos.length === 0 && (
                <button
                  class={styles.emptyAction}
                  type="button"
                  onClick={onOpenProdutos}
                >
                  IR PARA PRODUTOS E SERVIÇOS
                </button>
              )}
            </div>
          ) : (
            <ul class={styles.productGrid}>
              {produtosFiltrados.map((produto) => {
                const quantidade = carrinho[produto.id] ?? 0;

                return (
                  <li
                    key={produto.id}
                    class={quantidade > 0 ? styles.productSelected : undefined}
                  >
                    <button
                      class={styles.productMain}
                      type="button"
                      onClick={() => alterarQuantidade(produto.id, 1)}
                      disabled={
                        processando ||
                        (produto.estoque_quantidade !== null &&
                          quantidade >= produto.estoque_quantidade)
                      }
                      aria-label={`Adicionar ${produto.nome} ao carrinho`}
                    >
                      <strong>{produto.nome}</strong>
                      <span>{formatarCentavos(produto.preco_padrao_centavos)}</span>
                    </button>
                    <div class={styles.productActions}>
                      <span class={styles.quantityBadge} aria-label={`${quantidade} no carrinho`}>
                        {quantidade}
                      </span>
                      <span class={styles.stockBadge}>
                        {produto.tipo === "SERVICO"
                          ? "SERVIÇO"
                          : produto.estoque_quantidade === null
                            ? "SEM CONTROLE"
                            : `${produto.estoque_quantidade} EM ESTOQUE`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside class={styles.cartSection} aria-labelledby="cart-title">
          <div class={styles.sectionHeader}>
            <div>
              <span class={styles.step}>02</span>
              <h2 id="cart-title">CARRINHO</h2>
            </div>
            <span class={styles.itemCount}>
              {itensCarrinho.reduce((total, item) => total + item.quantidade, 0)} ITENS
            </span>
          </div>

          {itensCarrinho.length === 0 ? (
            <div class={styles.cartEmpty}>
              <span aria-hidden="true">←</span>
              <strong>TOQUE EM UM PRODUTO.</strong>
              <p>Ele aparece aqui na hora.</p>
            </div>
          ) : (
            <ul class={styles.cartList}>
              {itensCarrinho.map(({ produto, quantidade }) => (
                <li key={produto.id}>
                  <div>
                    <strong>{produto.nome}</strong>
                    <span>
                      {formatarCentavos(produto.preco_padrao_centavos)} cada
                    </span>
                  </div>
                  <div class={styles.quantityControl}>
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(produto.id, -1)}
                      aria-label={`Diminuir ${produto.nome}`}
                      disabled={processando}
                    >
                      −
                    </button>
                    <strong>{quantidade}</strong>
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(produto.id, 1)}
                      aria-label={`Aumentar ${produto.nome}`}
                      disabled={processando}
                    >
                      +
                    </button>
                  </div>
                  <strong>
                    {formatarCentavos(produto.preco_padrao_centavos * quantidade)}
                  </strong>
                </li>
              ))}
            </ul>
          )}

          <div class={styles.total}>
            <span>TOTAL</span>
            <strong>{formatarCentavos(totalCarrinhoCentavos)}</strong>
          </div>

          <div class={styles.paymentArea}>
            <span class={styles.paymentLabel}>03 • COMO RECEBEU?</span>
            <div class={styles.paymentButtons}>
              {(["PIX", "DINHEIRO", "CARTAO"] as const).map((metodo) => (
                <button
                  key={metodo}
                  type="button"
                  onClick={() => finalizarVenda(metodo)}
                  disabled={itensCarrinho.length === 0 || processando}
                >
                  {processando ? "..." : metodo === "CARTAO" ? "CARTÃO" : metodo}
                </button>
              ))}
              <button
                class={styles.fiadoButton}
                type="button"
                onClick={() => setMostrarFiado((atual) => !atual)}
                disabled={itensCarrinho.length === 0 || processando}
                aria-expanded={mostrarFiado}
              >
                FIADO
              </button>
            </div>
            {mostrarFiado && (
              <form class={styles.fiadoForm} onSubmit={finalizarVendaFiada}>
                {clientes.length === 0 ? (
                  <div class={styles.noClient}>
                    <strong>CADASTRE UM CLIENTE PRIMEIRO.</strong>
                    <button type="button" onClick={onOpenClientes}>
                      IR PARA CLIENTES
                    </button>
                  </div>
                ) : (
                  <>
                    <label htmlFor="fiado-client">
                      CLIENTE
                      <select
                        id="fiado-client"
                        value={clienteFiadoId}
                        onChange={(event) =>
                          setClienteFiadoId(event.currentTarget.value)
                        }
                        required
                      >
                        {clientes.map((cliente) => (
                          <option key={cliente.id} value={cliente.id}>
                            {cliente.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="fiado-due-date">
                      VENCIMENTO
                      <input
                        id="fiado-due-date"
                        type="date"
                        value={dataVencimento}
                        onInput={(event) =>
                          setDataVencimento(event.currentTarget.value)
                        }
                        required
                      />
                    </label>
                    <button
                      class={styles.confirmFiado}
                      type="submit"
                      disabled={processando}
                    >
                      {processando ? "LANÇANDO..." : "CONFIRMAR FIADO"}
                    </button>
                  </>
                )}
              </form>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
