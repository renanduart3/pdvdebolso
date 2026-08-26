import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { formatarCentavos, parsePrecoParaCentavos } from "../../database/money";
import { catalogoRepository } from "../../database/repositories";
import type { PaginaCatalogo } from "../../database/repositories/catalogoRepository";
import type { ProdutoCatalogo, TipoItemCatalogo } from "../../database/types";
import {
  filtrarDecimal,
  filtrarInteiro
} from "../shared/numericInput";
import { EditIcon, TrashIcon } from "../shared/icons";
import styles from "../shared/Management.module.css";

const PAGINA_VAZIA: PaginaCatalogo = {
  itens: [],
  pagina: 1,
  tamanho: 8,
  total: 0,
  total_paginas: 1
};

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

type CatalogoPageProps = { onDataChange?: () => void };

export function CatalogoPage({ onDataChange }: CatalogoPageProps) {
  const formularioRef = useRef<HTMLFormElement>(null);
  const [resultado, setResultado] = useState(PAGINA_VAZIA);
  const [edicaoId, setEdicaoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [tipo, setTipo] = useState<TipoItemCatalogo>("PRODUTO");
  const [estoque, setEstoque] = useState("0");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [recarregar, setRecarregar] = useState(0);
  const [confirmando, setConfirmando] = useState<ProdutoCatalogo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const timer = window.setTimeout(() => {
      setCarregando(true);
      catalogoRepository
        .listarPagina({ busca, pagina, tamanho: 8 })
        .then((dados) => {
          if (!ativo) return;
          setResultado(dados);
          setPagina(dados.pagina);
        })
        .catch((error: unknown) => {
          if (ativo) setErro(mensagemErro(error));
        })
        .finally(() => {
          if (ativo) setCarregando(false);
        });
    }, 180);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [busca, pagina, recarregar]);

  function limparFormulario() {
    setEdicaoId(null);
    setNome("");
    setPreco("");
    setTipo("PRODUTO");
    setEstoque("0");
  }

  function editar(item: ProdutoCatalogo) {
    setEdicaoId(item.id);
    setNome(item.nome);
    setPreco((item.preco_padrao_centavos / 100).toFixed(2).replace(".", ","));
    setTipo(item.tipo);
    setEstoque(String(item.estoque_quantidade ?? 0));
    setErro(null);
    setSucesso(null);
    formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function salvar(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      const input = {
        nome,
        preco_padrao_centavos: parsePrecoParaCentavos(preco),
        tipo,
        estoque_quantidade: tipo === "PRODUTO" ? Number(estoque) : null
      };
      const item = edicaoId
        ? await catalogoRepository.atualizar(edicaoId, input)
        : await catalogoRepository.criar(input);
      limparFormulario();
      setBusca("");
      setPagina(1);
      setRecarregar((atual) => atual + 1);
      setSucesso(`${item.nome} foi ${edicaoId ? "atualizado" : "cadastrado"}.`);
      onDataChange?.();
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function excluir(item: ProdutoCatalogo) {
    setProcessando(true);
    setErro(null);
    try {
      const resultadoExclusao = await catalogoRepository.excluir(item.id);
      setConfirmando(null);
      setRecarregar((atual) => atual + 1);
      setSucesso(
        resultadoExclusao === "EXCLUIDO"
          ? `${item.nome} foi excluído.`
          : `${item.nome} foi removido do catálogo e preservado no histórico.`
      );
      onDataChange?.();
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
        <p>Cadastre, edite e exclua itens sem comprometer o histórico das vendas.</p>
      </section>

      {erro && <div class={`${styles.notice} ${styles.error}`} role="alert"><strong>ATENÇÃO:</strong> {erro}<button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">×</button></div>}
      {sucesso && <div class={`${styles.notice} ${styles.success}`} role="status"><strong>PRONTO:</strong> {sucesso}<button type="button" onClick={() => setSucesso(null)} aria-label="Fechar mensagem">×</button></div>}

      <form ref={formularioRef} class={`${styles.panel} ${styles.formPanel}`} onSubmit={salvar}>
        <div class={styles.panelTitle}><span>01</span><h2>{edicaoId ? "EDITAR ITEM" : "NOVO ITEM"}</h2></div>
        <div class={styles.formGrid}>
          <div class={styles.choiceGrid} aria-label="Tipo do item">
            {(["PRODUTO", "SERVICO"] as const).map((opcao) => (
              <label key={opcao}><input type="radio" name="item-type" value={opcao} checked={tipo === opcao} onChange={() => setTipo(opcao)} />{opcao === "SERVICO" ? "SERVIÇO" : opcao}</label>
            ))}
          </div>
          <label htmlFor="catalog-item-name">NOME<input id="catalog-item-name" value={nome} onInput={(event) => setNome(event.currentTarget.value)} maxLength={120} placeholder={tipo === "PRODUTO" ? "Ex.: Café grande" : "Ex.: Corte de cabelo"} required /></label>
          <label htmlFor="catalog-item-price">PREÇO PADRÃO<input id="catalog-item-price" value={preco} onInput={(event) => setPreco(filtrarDecimal(event.currentTarget.value))} inputMode="decimal" placeholder="0,00" required /></label>
          {tipo === "PRODUTO" ? (
            <label htmlFor="catalog-item-stock">QUANTIDADE EM ESTOQUE<input id="catalog-item-stock" type="text" inputMode="numeric" value={estoque} onInput={(event) => setEstoque(filtrarInteiro(event.currentTarget.value, true))} required /></label>
          ) : <span class={styles.fieldHint}>SERVIÇOS NÃO POSSUEM ESTOQUE.</span>}
          <div class={styles.formActions}>
            {edicaoId && <button class={styles.secondaryButton} type="button" onClick={limparFormulario}>CANCELAR</button>}
            <button class={styles.button} type="submit" disabled={processando}>{processando ? "SALVANDO..." : edicaoId ? "SALVAR ALTERAÇÕES" : "CADASTRAR ITEM"}</button>
          </div>
        </div>
      </form>

      <section class={`${styles.panel} ${styles.listPanel}`} aria-labelledby="catalog-list-title">
        <div class={styles.panelTitle}><span>02</span><h2 id="catalog-list-title">ITENS CADASTRADOS</h2></div>
        <div class={styles.listToolbar}>
          <label htmlFor="catalog-management-search">BUSCA RÁPIDA POR INÍCIO DO NOME<input id="catalog-management-search" type="search" value={busca} onInput={(event) => { setBusca(event.currentTarget.value); setPagina(1); }} placeholder="Ex.: caf" /></label>
          <span class={styles.resultCount}>{resultado.total} ITENS • ORDEM Z–A</span>
        </div>
        {carregando ? <div class={styles.empty} role="status"><strong>BUSCANDO ITENS...</strong></div> : resultado.itens.length === 0 ? (
          <div class={styles.empty}><strong>NENHUM ITEM AQUI.</strong><span>Cadastre um item ou tente outro início de nome.</span></div>
        ) : (
          <div class={styles.tableWrapper}>
            <table class={styles.dataTable}>
              <thead>
                <tr>
                  <th>TIPO</th>
                  <th>NOME DO ITEM</th>
                  <th>ESTOQUE</th>
                  <th>PREÇO PADRÃO</th>
                  <th class={styles.actionCol}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {resultado.itens.map((item) => (
                  confirmando?.id === item.id ? (
                    <tr key={item.id} class={styles.confirmActionRow}>
                      <td colSpan={5}>
                        <div class={styles.confirmFlex} role="alertdialog" aria-label={`Confirmar exclusão de ${item.nome}`}>
                          <div>
                            <strong>EXCLUIR {item.nome}?</strong>
                            <span> — Item será preservado no histórico se houver vendas.</span>
                          </div>
                          <div class={styles.confirmButtons}>
                            <button type="button" onClick={() => setConfirmando(null)}>CANCELAR</button>
                            <button type="button" onClick={() => excluir(item)} disabled={processando}>CONFIRMAR EXCLUSÃO</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td><span class={styles.tag}>{item.tipo === "SERVICO" ? "SERVIÇO" : "PRODUTO"}</span></td>
                      <td class={styles.cellPrimary}>{item.nome}</td>
                      <td class={styles.cellSecondary}>{item.tipo === "SERVICO" ? "SEM ESTOQUE" : `${item.estoque_quantidade} UNID.`}</td>
                      <td class={styles.cellPrice}>{formatarCentavos(item.preco_padrao_centavos)}</td>
                      <td class={styles.actionCol}>
                        <div class={styles.actionGroup}>
                          <button class={styles.actionButton} type="button" onClick={() => editar(item)} disabled={processando} aria-label="EDITAR ITEM" title="Editar item" data-tooltip="Editar item"><EditIcon /></button>
                          <button class={styles.dangerButton} type="button" onClick={() => setConfirmando(item)} disabled={processando} aria-label="EXCLUIR ITEM" title="Excluir item" data-tooltip="Excluir item"><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav class={styles.pagination} aria-label="Paginação do catálogo">
          <button type="button" onClick={() => setPagina((atual) => atual - 1)} disabled={resultado.pagina <= 1 || carregando} title="Página anterior" data-tooltip="Página anterior">← ANTERIOR</button>
          <span>PÁGINA {resultado.pagina} DE {resultado.total_paginas}</span>
          <button type="button" onClick={() => setPagina((atual) => atual + 1)} disabled={resultado.pagina >= resultado.total_paginas || carregando} title="Próxima página" data-tooltip="Próxima página">PRÓXIMA →</button>
        </nav>
      </section>
    </main>
  );
}
