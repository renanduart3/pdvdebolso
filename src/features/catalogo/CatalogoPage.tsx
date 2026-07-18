import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { formatarCentavos, parsePrecoParaCentavos } from "../../database/money";
import { catalogoRepository } from "../../database/repositories";
import type {
  ProdutoCatalogo,
  TipoItemCatalogo
} from "../../database/types";
import styles from "../shared/Management.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

export function CatalogoPage() {
  const [itens, setItens] = useState<ProdutoCatalogo[]>([]);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [tipo, setTipo] = useState<TipoItemCatalogo>("PRODUTO");
  const [controlarEstoque, setControlarEstoque] = useState(false);
  const [estoque, setEstoque] = useState("0");
  const [busca, setBusca] = useState("");
  const [estoquesEdicao, setEstoquesEdicao] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const catalogo = await catalogoRepository.listarTodos();
    setItens(catalogo);
    setEstoquesEdicao(
      Object.fromEntries(
        catalogo.map((item) => [
          item.id,
          item.estoque_quantidade?.toString() ?? "0"
        ])
      )
    );
  }, []);

  useEffect(() => {
    carregar().catch((error: unknown) => setErro(mensagemErro(error)));
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return itens.filter(
      (item) => !termo || item.nome.toLocaleLowerCase("pt-BR").includes(termo)
    );
  }, [busca, itens]);

  async function cadastrar(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);

    try {
      const estoqueQuantidade =
        tipo === "PRODUTO" && controlarEstoque
          ? Number(estoque)
          : null;
      const item = await catalogoRepository.criar({
        nome,
        preco_padrao_centavos: parsePrecoParaCentavos(preco),
        tipo,
        estoque_quantidade: estoqueQuantidade
      });
      setItens((atuais) =>
        [...atuais, item].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      );
      setEstoquesEdicao((atual) => ({
        ...atual,
        [item.id]: item.estoque_quantidade?.toString() ?? "0"
      }));
      setNome("");
      setPreco("");
      setTipo("PRODUTO");
      setControlarEstoque(false);
      setEstoque("0");
      setSucesso(`${item.nome} foi cadastrado como ${item.tipo.toLowerCase()}.`);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function alternarAtivo(item: ProdutoCatalogo) {
    setProcessando(true);
    setErro(null);
    try {
      if (item.ativo) await catalogoRepository.desativar(item.id);
      else await catalogoRepository.reativar(item.id);
      await carregar();
      setSucesso(`${item.nome} foi ${item.ativo ? "desativado" : "reativado"}.`);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function salvarEstoque(
    event: JSX.TargetedSubmitEvent<HTMLFormElement>,
    item: ProdutoCatalogo
  ) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    try {
      await catalogoRepository.definirEstoque(
        item.id,
        Number(estoquesEdicao[item.id])
      );
      await carregar();
      setSucesso(`Estoque de ${item.nome} atualizado.`);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function alternarControleEstoque(item: ProdutoCatalogo) {
    setProcessando(true);
    setErro(null);
    try {
      await catalogoRepository.definirEstoque(
        item.id,
        item.estoque_quantidade === null ? 0 : null
      );
      await carregar();
      setSucesso(
        `Controle de estoque ${item.estoque_quantidade === null ? "ativado" : "desativado"} para ${item.nome}.`
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
        <span class={styles.eyebrow}>CADASTRO • PRODUTOS E SERVIÇOS</span>
        <h1>SEU CATÁLOGO.</h1>
        <p>Cadastre o que vende, defina preços e controle estoque só quando fizer sentido.</p>
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

      <div class={styles.grid}>
        <form class={`${styles.panel} ${styles.sticky}`} onSubmit={cadastrar}>
          <div class={styles.panelTitle}>
            <span>01</span>
            <h2>NOVO ITEM</h2>
          </div>
          <div class={styles.choiceGrid} aria-label="Tipo do item">
            {(["PRODUTO", "SERVICO"] as const).map((opcao) => (
              <label key={opcao}>
                <input
                  type="radio"
                  name="item-type"
                  value={opcao}
                  checked={tipo === opcao}
                  onChange={() => {
                    setTipo(opcao);
                    if (opcao === "SERVICO") setControlarEstoque(false);
                  }}
                />
                {opcao === "SERVICO" ? "SERVIÇO" : opcao}
              </label>
            ))}
          </div>
          <label htmlFor="catalog-item-name">
            NOME
            <input
              id="catalog-item-name"
              value={nome}
              onInput={(event) => setNome(event.currentTarget.value)}
              maxLength={120}
              placeholder={tipo === "PRODUTO" ? "Ex.: Café grande" : "Ex.: Corte de cabelo"}
              required
            />
          </label>
          <label htmlFor="catalog-item-price">
            PREÇO PADRÃO
            <input
              id="catalog-item-price"
              value={preco}
              onInput={(event) => setPreco(event.currentTarget.value)}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
          </label>
          {tipo === "PRODUTO" && (
            <>
              <label class={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={controlarEstoque}
                  onChange={(event) =>
                    setControlarEstoque(event.currentTarget.checked)
                  }
                />
                CONTROLAR ESTOQUE
              </label>
              {controlarEstoque && (
                <label htmlFor="catalog-item-stock">
                  QUANTIDADE INICIAL
                  <input
                    id="catalog-item-stock"
                    type="number"
                    min="0"
                    step="1"
                    value={estoque}
                    onInput={(event) => setEstoque(event.currentTarget.value)}
                    required
                  />
                </label>
              )}
            </>
          )}
          <button class={styles.button} type="submit" disabled={processando}>
            {processando ? "SALVANDO..." : "CADASTRAR ITEM"}
          </button>
        </form>

        <section class={styles.panel} aria-labelledby="catalog-list-title">
          <div class={styles.panelTitle}>
            <span>02</span>
            <h2 id="catalog-list-title">ITENS CADASTRADOS</h2>
          </div>
          <label htmlFor="catalog-management-search">
            BUSCAR
            <input
              id="catalog-management-search"
              type="search"
              value={busca}
              onInput={(event) => setBusca(event.currentTarget.value)}
              placeholder="Nome do produto ou serviço"
            />
          </label>
          {filtrados.length === 0 ? (
            <div class={styles.empty}>
              <strong>NENHUM ITEM AQUI.</strong>
              <span>Use o formulário para montar seu catálogo.</span>
            </div>
          ) : (
            <ul class={styles.list}>
              {filtrados.map((item) => (
                <li class={styles.card} key={item.id}>
                  <div class={styles.cardMain}>
                    <div>
                      <span class={styles.tag}>
                        {item.tipo === "SERVICO" ? "SERVIÇO" : "PRODUTO"}
                        {!item.ativo ? " • INATIVO" : ""}
                      </span>
                      <h3>{item.nome}</h3>
                      <p>
                        {item.tipo === "SERVICO"
                          ? "SEM ESTOQUE"
                          : item.estoque_quantidade === null
                            ? "ESTOQUE NÃO CONTROLADO"
                            : `${item.estoque_quantidade} UNIDADES EM ESTOQUE`}
                      </p>
                    </div>
                    <strong class={styles.cardValue}>
                      {formatarCentavos(item.preco_padrao_centavos)}
                    </strong>
                  </div>
                  {item.tipo === "PRODUTO" && item.estoque_quantidade !== null && (
                    <form
                      class={styles.stockForm}
                      onSubmit={(event) => salvarEstoque(event, item)}
                    >
                      <input
                        aria-label={`Novo estoque de ${item.nome}`}
                        type="number"
                        min="0"
                        step="1"
                        value={estoquesEdicao[item.id] ?? "0"}
                        onInput={(event) =>
                          setEstoquesEdicao((atual) => ({
                            ...atual,
                            [item.id]: event.currentTarget.value
                          }))
                        }
                        required
                      />
                      <button type="submit" disabled={processando}>
                        ATUALIZAR ESTOQUE
                      </button>
                    </form>
                  )}
                  <div class={styles.cardActions}>
                    {item.tipo === "PRODUTO" && (
                      <button
                        type="button"
                        onClick={() => alternarControleEstoque(item)}
                        disabled={processando}
                      >
                        {item.estoque_quantidade === null
                          ? "ATIVAR ESTOQUE"
                          : "PARAR DE CONTROLAR"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => alternarAtivo(item)}
                      disabled={processando}
                    >
                      {item.ativo ? "DESATIVAR ITEM" : "REATIVAR ITEM"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
