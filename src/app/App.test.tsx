import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { database } from "../database/database";
import { App } from "./App";

describe("App", () => {
  beforeEach(async () => {
    document.documentElement.dataset.theme = "IMPACTO";
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true
    });
    await database.open();
    await database.transaction(
      "rw",
      database.clientes,
      database.catalogo,
      database.transacoes,
      database.configuracoes,
      async () => {
        await database.clientes.clear();
        await database.catalogo.clear();
        await database.transacoes.clear();
        await database.configuracoes.clear();
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true
    });
  });

  it("renderiza o PDV expresso", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "VENDA RÁPIDA." })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ENCONTRAR ITEM" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CARRINHO" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ NOVO PRODUTO" })
    ).not.toBeInTheDocument();
  });

  it("pagina o carrinho em grupos de dez itens", async () => {
    await database.catalogo.bulkAdd(
      Array.from({ length: 11 }, (_, indice) => ({
        id: `produto-paginado-${indice + 1}`,
        nome: `Produto paginado ${String(indice + 1).padStart(2, "0")}`,
        preco_padrao_centavos: 100,
        tipo: "PRODUTO" as const,
        estoque_quantidade: 20,
        ativo: true
      }))
    );
    render(<App />);

    for (let indice = 1; indice <= 11; indice += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: "VER TODOS OS ITENS" })
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: `Adicionar Produto paginado ${String(indice).padStart(2, "0")} ao carrinho`
        })
      );
    }

    const carrinho = screen.getByRole("region", { name: "CARRINHO" });
    expect(within(carrinho).getByText("PÁGINA 2 DE 2")).toBeInTheDocument();
    expect(within(carrinho).getAllByRole("listitem")).toHaveLength(1);

    fireEvent.click(within(carrinho).getByRole("button", { name: "← ANTERIOR" }));
    expect(within(carrinho).getByText("PÁGINA 1 DE 2")).toBeInTheDocument();
    expect(within(carrinho).getAllByRole("listitem")).toHaveLength(10);
  }, 10_000);

  it("cadastra produto, monta carrinho e registra venda PIX", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Produtos e Serviços" })
    );
    fireEvent.input(screen.getByLabelText("NOME"), {
      target: { value: "Café grande" }
    });
    fireEvent.input(screen.getByLabelText("PREÇO PADRÃO"), {
      target: { value: "8,50" }
    });
    fireEvent.input(screen.getByLabelText("QUANTIDADE EM ESTOQUE"), {
      target: { value: "2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CADASTRAR ITEM" }));
    await screen.findByText(/Café grande foi cadastrado/);

    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    fireEvent.input(screen.getByLabelText("DIGITE O INÍCIO DO NOME"), {
      target: { value: "Caf" }
    });
    const adicionar = await screen.findByRole("button", {
      name: "Adicionar Café grande ao carrinho"
    });
    fireEvent.click(adicionar);
    fireEvent.click(screen.getByRole("button", { name: "PIX" }));
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR VENDA" }));
    expect(
      screen.getByRole("heading", { name: "CONFIRMAR VENDA?" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "FINALIZAR VENDA" }));

    await screen.findByText(/Venda de R\$ 8,50 registrada no PIX/);
    await waitFor(async () => {
      expect(await database.transacoes.count()).toBe(1);
      expect((await database.catalogo.toArray())[0].estoque_quantidade).toBe(1);
    });
  });

  it("aplica desconto e só grava depois da finalização explícita", async () => {
    await database.catalogo.add({
      id: "produto-desconto",
      nome: "Kit almoço",
      preco_padrao_centavos: 2000,
      tipo: "PRODUTO",
      estoque_quantidade: 20,
      ativo: true
    });
    render(<App />);

    fireEvent.input(screen.getByLabelText("DIGITE O INÍCIO DO NOME"), {
      target: { value: "Kit" }
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Adicionar Kit almoço ao carrinho"
      })
    );
    fireEvent.input(screen.getByLabelText("DESCONTO PERCENTUAL"), {
      target: { value: "12,5" }
    });
    fireEvent.click(screen.getByRole("button", { name: "DINHEIRO" }));
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR VENDA" }));

    expect(await database.transacoes.count()).toBe(0);
    expect(screen.getAllByText("R$ 17,50").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "FINALIZAR VENDA" }));
    await screen.findByText(/Venda de R\$ 17,50 registrada no DINHEIRO/);
    expect((await database.transacoes.toArray())[0]).toMatchObject({
      valor_total_centavos: 1750
    });
  });

  it("cadastra cliente, registra venda fiada e faz uma baixa parcial", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Clientes" })[0]);
    fireEvent.input(screen.getByLabelText("NOME *"), {
      target: { value: "Maria Silva" }
    });
    fireEvent.input(screen.getByLabelText("TELEFONE COM DDD"), {
      target: { value: "(11) 99999-9999" }
    });
    fireEvent.click(screen.getByLabelText("ESTE NÚMERO É WHATSAPP"));
    fireEvent.click(screen.getByRole("button", { name: "CADASTRAR CLIENTE" }));
    await screen.findByText(/Maria Silva foi cadastrada|Maria Silva foi cadastrado/);

    fireEvent.click(
      screen.getByRole("button", { name: "Produtos e Serviços" })
    );
    fireEvent.click(screen.getByLabelText("SERVIÇO"));
    fireEvent.input(screen.getByLabelText("NOME"), {
      target: { value: "Entrega" }
    });
    fireEvent.input(screen.getByLabelText("PREÇO PADRÃO"), {
      target: { value: "10,00" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CADASTRAR ITEM" }));
    await screen.findByText(/Entrega foi cadastrado/);

    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    fireEvent.input(screen.getByLabelText("DIGITE O INÍCIO DO NOME"), {
      target: { value: "Ent" }
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Adicionar Entrega ao carrinho"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "FIADO" }));
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR FIADO" }));
    await screen.findByText(/Fiado de R\$ 10,00 lançado para Maria Silva/);

    fireEvent.click(screen.getAllByRole("button", { name: "Fiado" })[0]);
    expect(await screen.findByText("R$ 10,00")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "REGISTRAR PAGAMENTO" })
    );
    fireEvent.input(screen.getByLabelText(/VALOR RECEBIDO/), {
      target: { value: "4,00" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CONFIRMAR BAIXA" }));

    expect((await screen.findAllByText("R$ 6,00")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("PARCIAL")).toBeInTheDocument();
  });

  it("mantém cadastros fora das telas operacionais", async () => {
    render(<App />);

    expect(screen.queryByLabelText("NOME DO PRODUTO")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Fiado" })[0]);
    expect(
      screen.getByRole("heading", { name: "FIADO SOB CONTROLE." })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("NOME *")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CHAVE PIX")).not.toBeInTheDocument();
  });

  it("registra e cancela fiado avulso pela página de contas", async () => {
    await database.clientes.add({
      id: "cliente-fiado-avulso",
      nome: "Joana",
      telefone: "5511999999999",
      telefone_whatsapp: true,
      email: "joana@exemplo.com",
      anotacoes: null,
      data_cadastro: new Date().toISOString(),
      ativo: true
    });
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Fiado" })[0]);
    fireEvent.click(
      await screen.findByRole("button", { name: "VALOR AVULSO" })
    );
    fireEvent.input(screen.getByLabelText("BUSCAR CLIENTE"), {
      target: { value: "Joa" }
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Selecionar Joana" })
    );
    fireEvent.input(screen.getByLabelText("DESCRIÇÃO"), {
      target: { value: "Compra anotada" }
    });
    fireEvent.input(screen.getByLabelText("VENCIMENTO"), {
      target: { value: "2026-08-01" }
    });
    fireEvent.input(screen.getByLabelText("VALOR AVULSO"), {
      target: { value: "35,00" }
    });
    fireEvent.click(screen.getByRole("button", { name: "REGISTRAR FIADO" }));

    await screen.findByText(/Fiado de R\$ 35,00 registrado/);
    fireEvent.click(screen.getByRole("button", { name: "EXCLUIR FIADO" }));
    expect(
      screen.getByRole("alertdialog", {
        name: "Confirmar exclusão do fiado de Joana"
      })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "CONFIRMAR EXCLUSÃO" })
    );
    await screen.findByText(/Fiado de Joana foi cancelado/);
    expect(
      await database.transacoes.where("tipo").equals("CANCELAMENTO_VENDA").count()
    ).toBe(1);
  });

  it("exige confirmação antes de excluir cliente", async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Clientes" })[0]);
    fireEvent.input(screen.getByLabelText("NOME *"), {
      target: { value: "Cliente temporário" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CADASTRAR CLIENTE" }));
    await screen.findByText(/Cliente temporário foi cadastrado/);
    fireEvent.click(
      await screen.findByRole("button", { name: "EXCLUIR CLIENTE" })
    );

    expect(
      screen.getByRole("alertdialog", {
        name: "Confirmar exclusão de Cliente temporário"
      })
    ).toBeInTheDocument();
    expect(await database.clientes.count()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "CANCELAR" }));
    expect(await database.clientes.count()).toBe(1);
  });

  it("abre o painel de inteligência com dados calculados localmente", async () => {
    const produtoId = crypto.randomUUID();
    await database.catalogo.add({
      id: produtoId,
      nome: "Café",
      preco_padrao_centavos: 500,
      tipo: "PRODUTO",
      estoque_quantidade: 10,
      ativo: true
    });
    await database.transacoes.add({
      id: crypto.randomUUID(),
      data_hora: new Date().toISOString(),
      tipo: "VENDA",
      cliente_id: null,
      venda_id: null,
      data_vencimento: null,
      valor_total_centavos: 1000,
      status_pagamento: "PAGO",
      metodo_pagamento: "PIX",
      descricao: null,
      itens: [
        {
          id_produto: produtoId,
          nome_produto: "Café",
          quantidade: 2,
          preco_unitario_centavos: 500
        }
      ]
    });
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Inteligência" })
    );

    expect(
      await screen.findByRole("heading", { name: "NEGÓCIO EM NÚMEROS." })
    ).toBeInTheDocument();
    expect(screen.getByText("PRODUTOS CAMPEÕES")).toBeInTheDocument();
    expect((await screen.findAllByText("R$ 10,00")).length).toBeGreaterThan(0);
  });

  it("alerta quando existem dados sem backup e leva às configurações", async () => {
    await database.catalogo.add({
      id: crypto.randomUUID(),
      nome: "Serviço",
      preco_padrao_centavos: 1000,
      tipo: "SERVICO",
      estoque_quantidade: null,
      ativo: true
    });
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir notificações" })
    );
    const botaoBackup = await screen.findByRole("button", {
      name: /BACKUP PENDENTE/
    });
    fireEvent.click(botaoBackup);

    expect(
      await screen.findByRole("heading", { name: "BACKUP E RESTAURAÇÃO" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "EXPORTAR BANCO DE DADOS" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "IMPORTAR E SUBSTITUIR" })
    ).toBeDisabled();
  });

  it("aplica e persiste o tema Conforto pelas configurações", async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Configurações" })
    );

    fireEvent.click(
      await screen.findByRole("radio", { name: /CONFORTO/ })
    );
    fireEvent.click(screen.getByRole("button", { name: "APLICAR TEMA" }));

    await screen.findByText(/Tema conforto aplicado/);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("CONFORTO");
    });
    expect(await database.configuracoes.get("tema_aplicacao")).toMatchObject({
      valor: "CONFORTO"
    });

    cleanup();
    document.documentElement.dataset.theme = "IMPACTO";
    render(<App />);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("CONFORTO");
    });
  });

  it("restaura e ativa uma licença sem anúncios pelas configurações", async () => {
    vi.stubEnv("VITE_PAYMENT_WORKER_URL", "https://pagamentos.example");
    const codigo = "pdvb1.sessao-restaurada.codigo-seguro-1234567890";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          licenca: {
            versao: 1,
            token_restauracao: codigo,
            ativada_em: "2026-07-18T20:00:00.000Z",
            verificada_em: "2026-07-18T20:01:00.000Z"
          }
        })
      )
    );
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Configurações" })
    );

    fireEvent.input(
      await screen.findByLabelText("CÓDIGO DE RESTAURAÇÃO"),
      { target: { value: codigo } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: "RESTAURAR LICENÇA" })
    );

    expect(
      await screen.findByText("LICENÇA SEM ANÚNCIOS ATIVA")
    ).toBeInTheDocument();
    expect(await database.configuracoes.get("licenca_sem_anuncios")).toMatchObject({
      valor: {
        token_restauracao: codigo
      }
    });
  });

  it("mantém pagamento e restauração indisponíveis quando está offline", async () => {
    vi.stubEnv("VITE_PAYMENT_WORKER_URL", "https://pagamentos.example");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false
    });
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Configurações" })
    );

    expect(
      await screen.findByText("CONEXÃO NECESSÁRIA PARA PAGAR OU RESTAURAR")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "REMOVER ANÚNCIOS POR R$ 5,00" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "RESTAURAR LICENÇA" })
    ).toBeDisabled();
  });
});
