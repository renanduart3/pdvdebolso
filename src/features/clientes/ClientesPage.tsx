import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { clientesRepository } from "../../database/repositories";
import type { Cliente } from "../../database/types";
import styles from "../shared/Management.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir.";
}

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [anotacoes, setAnotacoes] = useState("");
  const [busca, setBusca] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setClientes(await clientesRepository.listar());
  }, []);

  useEffect(() => {
    carregar().catch((error: unknown) => setErro(mensagemErro(error)));
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return clientes.filter(
      (cliente) =>
        !termo ||
        cliente.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
        cliente.telefone?.includes(termo)
    );
  }, [busca, clientes]);

  async function cadastrar(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);

    try {
      const cliente = await clientesRepository.criar({
        nome,
        telefone,
        anotacoes
      });
      setClientes((atuais) =>
        [...atuais, cliente].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      );
      setNome("");
      setTelefone("");
      setAnotacoes("");
      setSucesso(`${cliente.nome} foi cadastrado.`);
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
        <p>Contatos e anotações ficam organizados aqui, separados das cobranças.</p>
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
            <h2>NOVO CLIENTE</h2>
          </div>
          <label htmlFor="client-name">
            NOME *
            <input
              id="client-name"
              value={nome}
              onInput={(event) => setNome(event.currentTarget.value)}
              maxLength={120}
              required
            />
          </label>
          <label htmlFor="client-phone">
            WHATSAPP COM DDD
            <input
              id="client-phone"
              value={telefone}
              onInput={(event) => setTelefone(event.currentTarget.value)}
              inputMode="tel"
              placeholder="(11) 99999-9999"
            />
          </label>
          <label htmlFor="client-notes">
            ANOTAÇÕES
            <textarea
              id="client-notes"
              value={anotacoes}
              onInput={(event) => setAnotacoes(event.currentTarget.value)}
              rows={4}
              placeholder="Ex.: prefere pagar na sexta"
            />
          </label>
          <button class={styles.button} type="submit" disabled={processando}>
            {processando ? "SALVANDO..." : "CADASTRAR CLIENTE"}
          </button>
        </form>

        <section class={styles.panel} aria-labelledby="clients-list-title">
          <div class={styles.panelTitle}>
            <span>02</span>
            <h2 id="clients-list-title">CLIENTES CADASTRADOS</h2>
          </div>
          <label htmlFor="clients-search">
            BUSCAR
            <input
              id="clients-search"
              type="search"
              value={busca}
              onInput={(event) => setBusca(event.currentTarget.value)}
              placeholder="Nome ou telefone"
            />
          </label>
          {filtrados.length === 0 ? (
            <div class={styles.empty}>
              <strong>NENHUM CLIENTE AQUI.</strong>
              <span>Cadastre o primeiro contato no formulário.</span>
            </div>
          ) : (
            <ul class={styles.list}>
              {filtrados.map((cliente) => (
                <li class={styles.card} key={cliente.id}>
                  <div class={styles.cardMain}>
                    <div>
                      <span class={styles.tag}>CLIENTE</span>
                      <h3>{cliente.nome}</h3>
                      <p>{cliente.telefone ?? "SEM WHATSAPP CADASTRADO"}</p>
                      {cliente.anotacoes && <small>{cliente.anotacoes}</small>}
                    </div>
                    <span class={styles.tag}>
                      {new Intl.DateTimeFormat("pt-BR").format(
                        new Date(cliente.data_cadastro)
                      )}
                    </span>
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
