import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { formatarCentavos } from "../../database/money";
import {
  catalogoRepository,
  clientesRepository,
  configuracoesRepository,
  transacoesRepository
} from "../../database/repositories";
import type { PaginaCatalogo } from "../../database/repositories/catalogoRepository";
import type {
  Cliente,
  ItemTransacao,
  MetodoPagamento,
  ProdutoCatalogo
} from "../../database/types";
import {
  aplicarDescontoAosItens,
  calcularDescontoPercentualCentavos,
  parsePercentualParaBasisPoints
} from "./desconto";
import { filtrarDecimal } from "../shared/numericInput";
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from "../shared/icons";
import styles from "./PdvPage.module.css";

type Carrinho = Record<string, number>;
type PdvPageProps = {
  onOpenProdutos?: () => void;
  onOpenClientes?: () => void;
  onDataChange?: () => void;
};

const paginaVazia: PaginaCatalogo = {
  itens: [],
  pagina: 1,
  tamanho: 12,
  total: 0,
  total_paginas: 1
};

const SESSAO_CARRINHO_KEY = "pdvb_carrinho_sessao";

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

export function PdvPage({
  onOpenProdutos,
  onOpenClientes,
  onDataChange
}: PdvPageProps) {
  const [produtosSelecionados, setProdutosSelecionados] = useState<ProdutoCatalogo[]>([]);
  const [sugestoes, setSugestoes] = useState<ProdutoCatalogo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carrinho, setCarrinho] = useState<Carrinho>({});
  const [busca, setBusca] = useState("");
  const [modalCatalogo, setModalCatalogo] = useState(false);
  const [buscaModal, setBuscaModal] = useState("");
  const [paginaModal, setPaginaModal] = useState(1);
  const [resultadoModal, setResultadoModal] = useState(paginaVazia);
  const [etapaPdv, setEtapaPdv] = useState<"PASSO1_SELECAO" | "PASSO2_CHECKOUT">("PASSO1_SELECAO");
  const [painelMovel, setPainelMovel] =
    useState<"CATALOGO" | "CARRINHO" | "CHECKOUT">("CATALOGO");
  const [paginaCarrinho, setPaginaCarrinho] = useState(1);
  const [descontoPercentual, setDescontoPercentual] = useState("");
  const [metodoSelecionado, setMetodoSelecionado] =
    useState<MetodoPagamento | null>(null);
  const [confirmandoVenda, setConfirmandoVenda] = useState(false);
  const [mostrarFiado, setMostrarFiado] = useState(false);
  const [clienteFiadoId, setClienteFiadoId] = useState("");
  const [dataVencimento, setDataVencimento] = useState(dataPadraoFiado);
  const [validarEstoque, setValidarEstoque] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    const [clientesCadastrados, validacao, todosProdutos] = await Promise.all([
      clientesRepository.listar(),
      configuracoesRepository.obterValidacaoEstoque(),
      catalogoRepository.listarTodos()
    ]);
    setClientes(clientesCadastrados);
    setValidarEstoque(validacao);
    if (clientesCadastrados.length > 0) {
      setClienteFiadoId((atual) =>
        atual && clientesCadastrados.some((c) => c.id === atual)
          ? atual
          : clientesCadastrados[0].id
      );
    }

    // Validação da sessão contra o banco de dados local para evitar itens fantasma
    const idsExistentes = new Set(todosProdutos.map((p) => p.id));
    setProdutosSelecionados((itens) =>
      itens.filter((item) => idsExistentes.has(item.id))
    );
    setCarrinho((carrinhoAtual) => {
      const proximo: Carrinho = {};
      for (const [id, q] of Object.entries(carrinhoAtual)) {
        if (idsExistentes.has(id)) {
          proximo[id] = q;
        }
      }
      return proximo;
    });
  }, []);

  useEffect(() => {
    if (clientes.length > 0 && !clienteFiadoId) {
      setClienteFiadoId(clientes[0].id);
    }
  }, [clientes, clienteFiadoId]);

  // Restauração da sessão do carrinho no carregamento inicial
  useEffect(() => {
    try {
      const sessaoSalva = sessionStorage.getItem(SESSAO_CARRINHO_KEY);
      if (sessaoSalva) {
        const dadosSessao = JSON.parse(sessaoSalva);
        if (dadosSessao.carrinho && typeof dadosSessao.carrinho === "object") {
          setCarrinho(dadosSessao.carrinho);
        }
        if (Array.isArray(dadosSessao.produtosSelecionados)) {
          setProdutosSelecionados(dadosSessao.produtosSelecionados);
        }
        if (typeof dadosSessao.descontoPercentual === "string") {
          setDescontoPercentual(dadosSessao.descontoPercentual);
        }
      }
    } catch {}
  }, []);

  // Salvamento contínuo da sessão do carrinho
  useEffect(() => {
    try {
      if (Object.keys(carrinho).length > 0) {
        sessionStorage.setItem(
          SESSAO_CARRINHO_KEY,
          JSON.stringify({ carrinho, produtosSelecionados, descontoPercentual })
        );
      } else {
        sessionStorage.removeItem(SESSAO_CARRINHO_KEY);
      }
    } catch {}
  }, [carrinho, produtosSelecionados, descontoPercentual]);

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
    const termo = busca.trim();
    if (!termo) {
      setSugestoes([]);
      return;
    }
    const timer = window.setTimeout(() => {
      catalogoRepository
        .listarPagina({ busca: termo, pagina: 1, tamanho: 6 })
        .then((resultado) => {
          if (ativo) setSugestoes(resultado.itens);
        })
        .catch((error: unknown) => {
          if (ativo) setErro(obterMensagemErro(error));
        });
    }, 150);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [busca]);

  useEffect(() => {
    if (!modalCatalogo) return;
    let ativo = true;
    const timer = window.setTimeout(() => {
      catalogoRepository
        .listarPagina({ busca: buscaModal, pagina: paginaModal, tamanho: 12 })
        .then((resultado) => {
          if (!ativo) return;
          setResultadoModal(resultado);
          setPaginaModal(resultado.pagina);
        })
        .catch((error: unknown) => {
          if (ativo) setErro(obterMensagemErro(error));
        });
    }, 120);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [buscaModal, modalCatalogo, paginaModal]);

  const itensCarrinho = useMemo(
    () =>
      produtosSelecionados
        .filter((produto) => carrinho[produto.id] > 0)
        .map((produto) => ({ produto, quantidade: carrinho[produto.id] })),
    [carrinho, produtosSelecionados]
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
  const totalPaginasCarrinho = Math.max(
    1,
    Math.ceil(itensCarrinho.length / 10)
  );
  const itensCarrinhoPaginados = useMemo(
    () =>
      itensCarrinho.slice(
        (paginaCarrinho - 1) * 10,
        paginaCarrinho * 10
      ),
    [itensCarrinho, paginaCarrinho]
  );

  useEffect(() => {
    setPaginaCarrinho((pagina) =>
      Math.min(Math.max(1, pagina), totalPaginasCarrinho)
    );
  }, [totalPaginasCarrinho]);

  const desconto = useMemo(() => {
    if (!descontoPercentual.trim()) return { basisPoints: 0, centavos: 0 };
    try {
      const basisPoints = parsePercentualParaBasisPoints(descontoPercentual);
      return {
        basisPoints,
        centavos: calcularDescontoPercentualCentavos(
          totalCarrinhoCentavos,
          basisPoints
        )
      };
    } catch {
      return null;
    }
  }, [descontoPercentual, totalCarrinhoCentavos]);

  const totalFinalCentavos = Math.max(
    0,
    totalCarrinhoCentavos - (desconto?.centavos ?? 0)
  );

  const criarItensDaVenda = useCallback((): ItemTransacao[] => {
    const itens = itensCarrinho.map(({ produto, quantidade }) => ({
      id_produto: produto.id,
      nome_produto: produto.nome,
      quantidade,
      preco_unitario_centavos: produto.preco_padrao_centavos
    }));
    return aplicarDescontoAosItens(itens, desconto?.centavos ?? 0);
  }, [desconto, itensCarrinho]);

  function adicionarProduto(produto: ProdutoCatalogo) {
    const atual = carrinho[produto.id] ?? 0;
    if (
      validarEstoque &&
      produto.tipo === "PRODUTO" &&
      produto.estoque_quantidade !== null &&
      atual >= produto.estoque_quantidade
    ) {
      setErro(`Estoque disponível de ${produto.nome}: ${produto.estoque_quantidade}.`);
      return;
    }
    setProdutosSelecionados((itens) =>
      itens.some((item) => item.id === produto.id) ? itens : [...itens, produto]
    );
    setCarrinho((itens) => ({ ...itens, [produto.id]: atual + 1 }));
    setBusca("");
    setSugestoes([]);
    setModalCatalogo(false);
    setPainelMovel("CARRINHO");
    if (!produtosSelecionados.some((item) => item.id === produto.id)) {
      setPaginaCarrinho(Math.ceil((itensCarrinho.length + 1) / 10));
    }
  }

  function alterarQuantidade(produtoId: string, delta: number) {
    const produto = produtosSelecionados.find((item) => item.id === produtoId);
    const atual = carrinho[produtoId] ?? 0;
    if (
      delta > 0 &&
      validarEstoque &&
      produto?.tipo === "PRODUTO" &&
      produto.estoque_quantidade !== null &&
      atual >= produto.estoque_quantidade
    ) {
      setErro(`Estoque disponível de ${produto.nome}: ${produto.estoque_quantidade}.`);
      return;
    }
    setCarrinho((itens) => {
      const quantidade = Math.max(0, (itens[produtoId] ?? 0) + delta);
      const proximo = { ...itens };
      if (quantidade === 0) delete proximo[produtoId];
      else proximo[produtoId] = quantidade;
      return proximo;
    });
  }

  function confirmarVenda() {
    setErro(null);
    if (!metodoSelecionado) {
      setErro("Escolha PIX, dinheiro ou cartão.");
      return;
    }
    if (!desconto) {
      setErro("Informe um desconto percentual entre 0% e 100%.");
      return;
    }
    setConfirmandoVenda(true);
  }

  function limparVenda() {
    setCarrinho({});
    setProdutosSelecionados([]);
    setDescontoPercentual("");
    setMetodoSelecionado(null);
    setConfirmandoVenda(false);
    setEtapaPdv("PASSO1_SELECAO");
    setPainelMovel("CATALOGO");
    setPaginaCarrinho(1);
    try {
      sessionStorage.removeItem(SESSAO_CARRINHO_KEY);
    } catch {}
  }

  async function finalizarVenda() {
    if (!metodoSelecionado) return;
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const venda = await transacoesRepository.registrarVendaPaga({
        itens: criarItensDaVenda(),
        metodo_pagamento: metodoSelecionado
      });
      limparVenda();
      setSucesso(
        `Venda de ${formatarCentavos(venda.valor_total_centavos)} registrada no ${metodoSelecionado}.`
      );
      onDataChange?.();
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
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const idParaUsar = clienteFiadoId || clientes[0]?.id || "";
      if (!idParaUsar) {
        throw new Error("Selecione um cliente para o fiado.");
      }
      const cliente = clientes.find((item) => item.id === idParaUsar);
      const venda = await transacoesRepository.registrarVendaFiada({
        itens: criarItensDaVenda(),
        cliente_id: idParaUsar,
        data_vencimento: dataVencimento
      });
      limparVenda();
      setMostrarFiado(false);
      setDataVencimento(dataPadraoFiado());
      setSucesso(
        `Fiado de ${formatarCentavos(venda.valor_total_centavos)} lançado para ${cliente?.nome ?? "o cliente"}.`
      );
      onDataChange?.();
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
          <span class={styles.eyebrow}>PDV EXPRESSO</span>
          <h1 id="pdv-title">VENDA RÁPIDA.</h1>
          <p>Encontre apenas o que entra nesta venda e finalize.</p>
        </div>
      </section>

      {erro && (
        <div class={`${styles.notice} ${styles.errorNotice}`} role="alert">
          <strong>ATENÇÃO:</strong> {erro}
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">×</button>
        </div>
      )}
      {sucesso && (
        <div class={`${styles.notice} ${styles.successNotice}`} role="status">
          <strong>PRONTO:</strong> {sucesso}
          <button type="button" onClick={() => setSucesso(null)} aria-label="Fechar mensagem">×</button>
        </div>
      )}

      {/* Barra Superior de Etapa e Ações do PDV */}
      <div class={styles.stepFlowBar}>
        <div>
          <span class={styles.step}>
            {etapaPdv === "PASSO1_SELECAO" ? "ETAPA 1/2" : "ETAPA 2/2"}
          </span>
          <span class={styles.stepFlowTitle}>
            {etapaPdv === "PASSO1_SELECAO"
              ? "01 - SELEÇÃO DE ITENS E CARRINHO"
              : "02 - CHECKOUT E PAGAMENTO"}
          </span>
        </div>
        <div class={styles.stepActions}>
          {Object.keys(carrinho).length > 0 && (
            <button
              class={styles.clearCartButton}
              type="button"
              onClick={limparVenda}
              title="Limpar todos os itens da venda"
              data-tooltip="Limpar venda"
            >
              <TrashIcon />
              <span>LIMPAR VENDA</span>
            </button>
          )}

          {etapaPdv === "PASSO1_SELECAO" ? (
            <button
              class={styles.proceedButton}
              type="button"
              onClick={() => {
                setEtapaPdv("PASSO2_CHECKOUT");
                setPainelMovel("CHECKOUT");
              }}
              disabled={itensCarrinho.length === 0}
              title="Ir para o pagamento"
              data-tooltip="Ir para checkout"
            >
              <span>PROSSEGUIR PARA CHECKOUT ({formatarCentavos(totalCarrinhoCentavos)})</span>
              <ChevronRightIcon />
            </button>
          ) : (
            <button
              class={styles.backButton}
              type="button"
              onClick={() => {
                setEtapaPdv("PASSO1_SELECAO");
                setPainelMovel("CARRINHO");
              }}
              title="Voltar aos itens do carrinho"
              data-tooltip="Voltar ao carrinho"
            >
              <ChevronLeftIcon />
              <span>VOLTAR AO CARRINHO</span>
            </button>
          )}
        </div>
      </div>

      <div class={`${styles.pdvGrid} ${etapaPdv === "PASSO2_CHECKOUT" ? styles.pdvGridCheckout : ""}`}>
        <div class={styles.mobileSwitch} aria-label="Área do PDV no celular">
          {etapaPdv === "PASSO1_SELECAO" ? (
            <>
              <button
                type="button"
                class={painelMovel === "CATALOGO" ? styles.mobileSwitchActive : undefined}
                onClick={() => setPainelMovel("CATALOGO")}
                aria-pressed={painelMovel === "CATALOGO"}
              >
                BUSCAR ITEM
              </button>
              <button
                type="button"
                class={painelMovel === "CARRINHO" ? styles.mobileSwitchActive : undefined}
                onClick={() => setPainelMovel("CARRINHO")}
                aria-pressed={painelMovel === "CARRINHO"}
              >
                CARRINHO ({itensCarrinho.reduce((total, item) => total + item.quantidade, 0)})
              </button>
            </>
          ) : (
            <button
              type="button"
              class={styles.mobileSwitchActive}
              onClick={() => {
                setEtapaPdv("PASSO1_SELECAO");
                setPainelMovel("CARRINHO");
              }}
            >
              ← VOLTAR AO CARRINHO
            </button>
          )}
        </div>

        {/* ETAPA 1: Busca de itens e Carrinho */}
        {etapaPdv === "PASSO1_SELECAO" && (
          <>
            {/* PASSO 1: Busca de itens */}
            <section
              class={`${styles.catalogSection} ${
                painelMovel === "CATALOGO" ? styles.mobileVisible : styles.mobileHidden
              }`}
              aria-labelledby="catalog-title"
            >
              <div class={styles.sectionHeader}>
                <div>
                  <span class={styles.step}>01</span>
                  <h2 id="catalog-title">ENCONTRAR ITEM</h2>
                </div>
                <span class={styles.itemCount}>
                  {validarEstoque ? "ESTOQUE VALIDADO" : "ESTOQUE LIVRE"}
                </span>
              </div>
              <div class={styles.findArea}>
                <label class={styles.searchLabel} htmlFor="catalog-search">
                  <span>DIGITE O INÍCIO DO NOME</span>
                  <input
                    id="catalog-search"
                    type="search"
                    value={busca}
                    onInput={(event) => setBusca(event.currentTarget.value)}
                    placeholder="Ex.: caf"
                    autoComplete="off"
                  />
                </label>
                <button
                  class={styles.openCatalog}
                  type="button"
                  onClick={() => setModalCatalogo(true)}
                  aria-label="VER TODOS OS ITENS"
                >
                  ⌕ <span>VER TODOS</span>
                </button>
              </div>

              {carregando ? (
                <div class={styles.emptyState} role="status">
                  <strong>PREPARANDO A VENDA...</strong>
                </div>
              ) : busca.trim() ? (
                sugestoes.length > 0 ? (
                  <ul class={styles.searchResults}>
                    {sugestoes.map((produto) => (
                      <li key={produto.id}>
                        <button
                          type="button"
                          onClick={() => adicionarProduto(produto)}
                          aria-label={`Adicionar ${produto.nome} ao carrinho`}
                        >
                          <span>
                            <strong>{produto.nome}</strong>
                            <small>
                              {produto.tipo === "SERVICO"
                                ? "SERVIÇO"
                                : `ESTOQUE: ${produto.estoque_quantidade}`}
                            </small>
                          </span>
                          <strong>{formatarCentavos(produto.preco_padrao_centavos)}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div class={styles.emptyState}>
                    <strong>NENHUM ITEM ENCONTRADO.</strong>
                    <button class={styles.emptyAction} type="button" onClick={onOpenProdutos}>
                      CADASTRAR NOVO ITEM
                    </button>
                  </div>
                )
              ) : (
                <div class={styles.searchPrompt}>
                  <strong>BUSQUE UM ITEM PARA ADICIONAR.</strong>
                </div>
              )}
            </section>

            {/* PASSO 1: Carrinho */}
            <section
              class={`${styles.cartSection} ${
                painelMovel === "CARRINHO" ? styles.mobileVisible : styles.mobileHidden
              }`}
              aria-labelledby="cart-title"
            >
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
                  <strong>NENHUM ITEM AINDA.</strong>
                  <p>Use a busca para montar esta venda.</p>
                </div>
              ) : (
                <ul class={styles.cartList}>
                  {itensCarrinhoPaginados.map(({ produto, quantidade }) => (
                    <li key={produto.id}>
                      <div>
                        <strong>{produto.nome}</strong>
                        <span>{formatarCentavos(produto.preco_padrao_centavos)} cada</span>
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
                      <strong>{formatarCentavos(produto.preco_padrao_centavos * quantidade)}</strong>
                    </li>
                  ))}
                </ul>
              )}

              {itensCarrinho.length > 0 && (
                <div class={styles.cartTotalSummary}>
                  <span>TOTAL DO CARRINHO</span>
                  <strong>{formatarCentavos(totalCarrinhoCentavos)}</strong>
                </div>
              )}

              {itensCarrinho.length > 0 && (
                <nav class={styles.cartPagination} aria-label="Paginação do carrinho">
                  <button
                    type="button"
                    onClick={() => setPaginaCarrinho((pagina) => pagina - 1)}
                    disabled={paginaCarrinho <= 1}
                  >
                    ← ANTERIOR
                  </button>
                  <span>
                    PÁGINA {paginaCarrinho} DE {totalPaginasCarrinho}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaginaCarrinho((pagina) => pagina + 1)}
                    disabled={paginaCarrinho >= totalPaginasCarrinho}
                  >
                    PRÓXIMA →
                  </button>
                </nav>
              )}
            </section>
          </>
        )}

        {/* ETAPA 2: Checkout e Pagamento apenas */}
        {etapaPdv === "PASSO2_CHECKOUT" && (
          <aside
            class={`${styles.checkoutSection} ${styles.checkoutFullSection}`}
            aria-labelledby="checkout-title"
          >
            <div class={styles.sectionHeader}>
              <div>
                <span class={styles.step}>02</span>
                <h2 id="checkout-title">CHECKOUT E PAGAMENTO</h2>
              </div>
              <span class={styles.itemCount}>
                {itensCarrinho.reduce((total, item) => total + item.quantidade, 0)} ITENS NESTA VENDA
              </span>
            </div>

            {/* Resumo em Texto dos Itens no Checkout */}
            <div class={styles.summarySection}>
              <div class={styles.summaryHeader}>
                <span class={styles.paymentLabel}>RESUMO DOS ITENS</span>
                <button
                  type="button"
                  class={styles.editCartLink}
                  onClick={() => {
                    setEtapaPdv("PASSO1_SELECAO");
                    setPainelMovel("CARRINHO");
                  }}
                  title="Voltar para editar os itens no carrinho"
                >
                  EDITAR CARRINHO ✎
                </button>
              </div>
              {itensCarrinho.length === 0 ? (
                <div class={styles.cartEmpty}>
                  <strong>CARRINHO VAZIO.</strong>
                </div>
              ) : (
                <ul class={styles.summaryList}>
                  {itensCarrinho.map(({ produto, quantidade }) => (
                    <li key={produto.id} class={styles.summaryItem}>
                      <div class={styles.summaryItemInfo}>
                        <span class={styles.summaryQty}>{quantidade}x</span>
                        <span class={styles.summaryName}>{produto.nome}</span>
                        {quantidade > 1 && (
                          <small class={styles.summaryUnit}>
                            ({formatarCentavos(produto.preco_padrao_centavos)} cada)
                          </small>
                        )}
                      </div>
                      <strong class={styles.summaryPrice}>
                        {formatarCentavos(produto.preco_padrao_centavos * quantidade)}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div class={styles.discountArea}>
              <label htmlFor="sale-discount">
                DESCONTO SOBRE O TOTAL
                <span class={styles.percentField}>
                  <input
                    id="sale-discount"
                    aria-label="DESCONTO PERCENTUAL"
                    value={descontoPercentual}
                    onInput={(event) =>
                      setDescontoPercentual(filtrarDecimal(event.currentTarget.value))
                    }
                    inputMode="decimal"
                    placeholder="0"
                    disabled={itensCarrinho.length === 0 || processando}
                    aria-invalid={desconto === null}
                  />
                  <span>%</span>
                </span>
              </label>
              <div>
                <span>SUBTOTAL</span>
                <strong>{formatarCentavos(totalCarrinhoCentavos)}</strong>
                <small>− {formatarCentavos(desconto?.centavos ?? 0)}</small>
              </div>
            </div>
            <div class={styles.total}>
              <span>TOTAL FINAL</span>
              <strong>{formatarCentavos(totalFinalCentavos)}</strong>
            </div>
            <div class={styles.paymentArea}>
              <span class={styles.paymentLabel}>COMO RECEBEU?</span>
              <div class={styles.paymentButtons}>
                {(["PIX", "DINHEIRO", "CARTAO"] as const).map((metodo) => (
                  <button
                    key={metodo}
                    type="button"
                    class={metodoSelecionado === metodo ? styles.selectedPayment : undefined}
                    onClick={() => {
                      setMetodoSelecionado(metodo);
                      setMostrarFiado(false);
                    }}
                    disabled={itensCarrinho.length === 0 || processando}
                    aria-pressed={metodoSelecionado === metodo}
                  >
                    {metodo === "CARTAO" ? "CARTÃO" : metodo}
                  </button>
                ))}
                <button
                  class={styles.fiadoButton}
                  type="button"
                  onClick={() => {
                    setMostrarFiado((atual) => !atual);
                    setMetodoSelecionado(null);
                  }}
                  disabled={itensCarrinho.length === 0 || processando}
                  aria-expanded={mostrarFiado}
                >
                  FIADO
                </button>
              </div>
              {!mostrarFiado && (
                <button
                  class={styles.confirmSale}
                  type="button"
                  onClick={confirmarVenda}
                  disabled={itensCarrinho.length === 0 || processando || metodoSelecionado === null}
                >
                  CONFIRMAR VENDA
                </button>
              )}
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
                          value={clienteFiadoId || clientes[0]?.id || ""}
                          onChange={(event) => setClienteFiadoId(event.currentTarget.value)}
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
                          onInput={(event) => setDataVencimento(event.currentTarget.value)}
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
        )}
      </div>

      {modalCatalogo && (
        <div class={styles.dialogBackdrop}>
          <section
            class={`${styles.confirmDialog} ${styles.catalogDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-dialog-title"
          >
            <div class={styles.modalHeader}>
              <div>
                <span class={styles.paymentLabel}>CATÁLOGO COMPLETO</span>
                <h2 id="catalog-dialog-title">ESCOLHA UM ITEM.</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalCatalogo(false)}
                aria-label="Fechar catálogo"
              >
                ×
              </button>
            </div>
            <label class={styles.searchLabel} htmlFor="modal-catalog-search">
              <span>BUSCAR</span>
              <input
                id="modal-catalog-search"
                type="search"
                value={buscaModal}
                onInput={(event) => {
                  setBuscaModal(event.currentTarget.value);
                  setPaginaModal(1);
                }}
                placeholder="Início do nome"
                autoFocus
              />
            </label>
            {resultadoModal.itens.length === 0 ? (
              <div class={styles.emptyState}>
                <strong>CATÁLOGO VAZIO.</strong>
              </div>
            ) : (
              <ul class={styles.modalCatalogList}>
                {resultadoModal.itens.map((produto) => (
                  <li key={produto.id}>
                    <button
                      type="button"
                      onClick={() => adicionarProduto(produto)}
                      aria-label={`Adicionar ${produto.nome} ao carrinho`}
                    >
                      <span>
                        <strong>{produto.nome}</strong>
                        <small>
                          {produto.tipo === "SERVICO"
                            ? "SERVIÇO"
                            : `ESTOQUE: ${produto.estoque_quantidade}`}
                        </small>
                      </span>
                      <strong>{formatarCentavos(produto.preco_padrao_centavos)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <nav class={styles.modalPagination} aria-label="Paginação do catálogo">
              <button
                type="button"
                onClick={() => setPaginaModal((pagina) => pagina - 1)}
                disabled={resultadoModal.pagina <= 1}
              >
                ←
              </button>
              <span>
                {resultadoModal.pagina} / {resultadoModal.total_paginas}
              </span>
              <button
                type="button"
                onClick={() => setPaginaModal((pagina) => pagina + 1)}
                disabled={resultadoModal.pagina >= resultadoModal.total_paginas}
              >
                →
              </button>
            </nav>
          </section>
        </div>
      )}

      {confirmandoVenda && metodoSelecionado && (
        <div class={styles.dialogBackdrop}>
          <section
            class={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-sale-title"
          >
            <div class={styles.confirmHeader}>
              <span class={styles.paymentLabel}>REVISE ANTES DE GRAVAR</span>
              <h2 id="confirm-sale-title">CONFIRMAR VENDA?</h2>
            </div>

            <div class={styles.confirmSummaryCard}>
              <div class={styles.confirmRow}>
                <span>FORMA DE PAGAMENTO</span>
                <strong class={styles.paymentMethodBadge}>
                  {metodoSelecionado === "CARTAO" ? "CARTÃO" : metodoSelecionado}
                </strong>
              </div>
              <div class={styles.confirmRow}>
                <span>DESCONTO APLICADO</span>
                <strong>
                  {((desconto?.basisPoints ?? 0) / 100).toLocaleString("pt-BR", {
                    maximumFractionDigits: 2
                  })}
                  % ({formatarCentavos(desconto?.centavos ?? 0)})
                </strong>
              </div>
              <div class={`${styles.confirmRow} ${styles.confirmRowTotal}`}>
                <span>TOTAL A RECEBER</span>
                <strong>{formatarCentavos(totalFinalCentavos)}</strong>
              </div>
            </div>

            <div class={styles.dialogActions}>
              <button
                type="button"
                class={styles.cancelSale}
                onClick={() => setConfirmandoVenda(false)}
                disabled={processando}
              >
                VOLTAR
              </button>
              <button
                class={styles.finishSale}
                type="button"
                onClick={finalizarVenda}
                disabled={processando}
              >
                {processando ? "FINALIZANDO..." : "FINALIZAR VENDA"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
