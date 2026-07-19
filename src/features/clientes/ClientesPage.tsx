import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { clientesRepository } from "../../database/repositories";
import type { PaginaClientes } from "../../database/repositories/clientesRepository";
import type { Cliente } from "../../database/types";
import styles from "../shared/Management.module.css";

const PAGINA_VAZIA: PaginaClientes = {
  itens: [],
  pagina: 1,
  tamanho: 8,
  total: 0,
  total_paginas: 1
};

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

type ClientesPageProps = { onDataChange?: () => void };

export function ClientesPage({ onDataChange }: ClientesPageProps) {
  const formularioRef = useRef<HTMLFormElement>(null);
  const [resultado, setResultado] = useState(PAGINA_VAZIA);
  const [edicaoId, setEdicaoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [telefoneWhatsApp, setTelefoneWhatsApp] = useState(false);
  const [email, setEmail] = useState("");
  const [anotacoes, setAnotacoes] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [recarregar, setRecarregar] = useState(0);
  const [confirmando, setConfirmando] = useState<Cliente | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const timer = window.setTimeout(() => {
      setCarregando(true);
      clientesRepository
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
    setTelefone("");
    setTelefoneWhatsApp(false);
    setEmail("");
    setAnotacoes("");
  }

  function editar(cliente: Cliente) {
    setEdicaoId(cliente.id);
    setNome(cliente.nome);
    setTelefone(cliente.telefone ?? "");
    setTelefoneWhatsApp(cliente.telefone_whatsapp);
    setEmail(cliente.email ?? "");
    setAnotacoes(cliente.anotacoes ?? "");
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
        telefone,
        telefone_whatsapp: telefoneWhatsApp,
        email,
        anotacoes
      };
      const cliente = edicaoId
        ? await clientesRepository.atualizar(edicaoId, input)
        : await clientesRepository.criar(input);
      const foiEdicao = Boolean(edicaoId);
      limparFormulario();
      setBusca("");
      setPagina(1);
      setRecarregar((atual) => atual + 1);
      setSucesso(`${cliente.nome} foi ${foiEdicao ? "atualizado" : "cadastrado"}.`);
      onDataChange?.();
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setProcessando(false);
    }
  }

  async function excluir(cliente: Cliente) {
    setProcessando(true);
    setErro(null);
    try {
      const resultadoExclusao = await clientesRepository.excluir(cliente.id);
      setConfirmando(null);
      setRecarregar((atual) => atual + 1);
      setSucesso(
        resultadoExclusao === "EXCLUIDO"
          ? `${cliente.nome} foi excluído.`
          : `${cliente.nome} foi removido dos cadastros e preservado no histórico.`
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
        <span class={styles.eyebrow}>CADASTRO • CLIENTES</span>
        <h1>SUA CLIENTELA.</h1>
        <p>Contatos completos, atalhos úteis e histórico financeiro preservado.</p>
      </section>

      {erro && <div class={`${styles.notice} ${styles.error}`} role="alert"><strong>ATENÇÃO:</strong> {erro}<button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">×</button></div>}
      {sucesso && <div class={`${styles.notice} ${styles.success}`} role="status"><strong>PRONTO:</strong> {sucesso}<button type="button" onClick={() => setSucesso(null)} aria-label="Fechar mensagem">×</button></div>}

      <form ref={formularioRef} class={`${styles.panel} ${styles.formPanel}`} onSubmit={salvar}>
        <div class={styles.panelTitle}><span>01</span><h2>{edicaoId ? "EDITAR CLIENTE" : "NOVO CLIENTE"}</h2></div>
        <div class={styles.clientFormGrid}>
          <label htmlFor="client-name">NOME *<input id="client-name" value={nome} onInput={(event) => setNome(event.currentTarget.value)} maxLength={120} required /></label>
          <label htmlFor="client-phone">TELEFONE COM DDD<input id="client-phone" value={telefone} onInput={(event) => setTelefone(event.currentTarget.value)} inputMode="tel" placeholder="(11) 99999-9999" /></label>
          <label class={styles.checkLabel}><input type="checkbox" checked={telefoneWhatsApp} onChange={(event) => setTelefoneWhatsApp(event.currentTarget.checked)} disabled={!telefone.trim()} />ESTE NÚMERO É WHATSAPP</label>
          <label htmlFor="client-email">E-MAIL<input id="client-email" type="email" value={email} onInput={(event) => setEmail(event.currentTarget.value)} placeholder="cliente@email.com" /></label>
          <label class={styles.notesField} htmlFor="client-notes">ANOTAÇÕES<input id="client-notes" value={anotacoes} onInput={(event) => setAnotacoes(event.currentTarget.value)} maxLength={240} placeholder="Ex.: prefere pagar na sexta" /></label>
          <div class={styles.formActions}>
            {edicaoId && <button class={styles.secondaryButton} type="button" onClick={limparFormulario}>CANCELAR</button>}
            <button class={styles.button} type="submit" disabled={processando}>{processando ? "SALVANDO..." : edicaoId ? "SALVAR ALTERAÇÕES" : "CADASTRAR CLIENTE"}</button>
          </div>
        </div>
      </form>

      <section class={`${styles.panel} ${styles.listPanel}`} aria-labelledby="clients-list-title">
        <div class={styles.panelTitle}><span>02</span><h2 id="clients-list-title">CLIENTES CADASTRADOS</h2></div>
        <div class={styles.listToolbar}>
          <label htmlFor="clients-search">BUSCA RÁPIDA POR INÍCIO DO NOME OU TELEFONE<input id="clients-search" type="search" value={busca} onInput={(event) => { setBusca(event.currentTarget.value); setPagina(1); }} placeholder="Ex.: mar ou 1199" /></label>
          <span class={styles.resultCount}>{resultado.total} CLIENTES • MAIS RECENTES PRIMEIRO</span>
        </div>
        {carregando ? <div class={styles.empty} role="status"><strong>BUSCANDO CLIENTES...</strong></div> : resultado.itens.length === 0 ? (
          <div class={styles.empty}><strong>NENHUM CLIENTE AQUI.</strong><span>Cadastre um contato ou tente outro início de nome.</span></div>
        ) : (
          <ul class={`${styles.list} ${styles.compactList}`}>
            {resultado.itens.map((cliente) => (
              <li class={styles.card} key={cliente.id}>
                <div class={styles.cardMain}>
                  <div>
                    <span class={styles.tag}>{cliente.telefone_whatsapp ? "WHATSAPP" : "CLIENTE"}</span>
                    <h3>{cliente.nome}</h3>
                    <p>{cliente.telefone ?? "SEM TELEFONE"}</p>
                    {cliente.email && <p>{cliente.email}</p>}
                    {cliente.anotacoes && <small>{cliente.anotacoes}</small>}
                  </div>
                  <span class={styles.tag}>{new Intl.DateTimeFormat("pt-BR").format(new Date(cliente.data_cadastro))}</span>
                </div>
                <div class={styles.cardActions}>
                  {cliente.telefone && cliente.telefone_whatsapp ? (
                    <a class={styles.whatsappAction} href={`https://wa.me/${cliente.telefone}`} target="_blank" rel="noopener noreferrer">ABRIR WHATSAPP ↗</a>
                  ) : <span class={styles.mutedAction}>SEM WHATSAPP</span>}
                  <button type="button" onClick={() => editar(cliente)} disabled={processando}>EDITAR CLIENTE</button>
                  <button class={styles.dangerButton} type="button" onClick={() => setConfirmando(cliente)} disabled={processando}>EXCLUIR CLIENTE</button>
                </div>
                {confirmando?.id === cliente.id && (
                  <div class={styles.confirmAction} role="alertdialog" aria-label={`Confirmar exclusão de ${cliente.nome}`}>
                    <strong>EXCLUIR {cliente.nome}?</strong>
                    <span>Se houver movimentação financeira, o cliente será preservado no histórico.</span>
                    <div><button type="button" onClick={() => setConfirmando(null)}>CANCELAR</button><button type="button" onClick={() => excluir(cliente)} disabled={processando}>CONFIRMAR EXCLUSÃO</button></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <nav class={styles.pagination} aria-label="Paginação de clientes"><button type="button" onClick={() => setPagina((atual) => atual - 1)} disabled={resultado.pagina <= 1 || carregando}>← ANTERIOR</button><span>PÁGINA {resultado.pagina} DE {resultado.total_paginas}</span><button type="button" onClick={() => setPagina((atual) => atual + 1)} disabled={resultado.pagina >= resultado.total_paginas || carregando}>PRÓXIMA →</button></nav>
      </section>
    </main>
  );
}
