import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { database } from "../database/database";
import { App } from "./App";

describe("App", () => {
  beforeEach(async () => {
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
  });

  it("renderiza o PDV expresso", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "VENDA RÁPIDA." })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "PRODUTOS E SERVIÇOS" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CARRINHO" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ NOVO PRODUTO" })
    ).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByLabelText("CONTROLAR ESTOQUE"));
    fireEvent.input(screen.getByLabelText("QUANTIDADE INICIAL"), {
      target: { value: "2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CADASTRAR ITEM" }));
    await screen.findByText(/Café grande foi cadastrado como produto/);

    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    const adicionar = await screen.findByRole("button", {
      name: "Adicionar Café grande ao carrinho"
    });
    fireEvent.click(adicionar);
    fireEvent.click(screen.getByRole("button", { name: "PIX" }));

    await screen.findByText(/Venda de R\$ 8,50 registrada no PIX/);
    await waitFor(async () => {
      expect(await database.transacoes.count()).toBe(1);
      expect((await database.catalogo.toArray())[0].estoque_quantidade).toBe(1);
    });
  });

  it("cadastra cliente, registra venda fiada e faz uma baixa parcial", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Clientes" })[0]);
    fireEvent.input(screen.getByLabelText("NOME *"), {
      target: { value: "Maria Silva" }
    });
    fireEvent.input(screen.getByLabelText("WHATSAPP COM DDD"), {
      target: { value: "(11) 99999-9999" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CADASTRAR CLIENTE" }));
    await screen.findByText(/Maria Silva foi cadastrado/);

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
    await screen.findByText(/Entrega foi cadastrado como servico/);

    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
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

  it("abre o painel de inteligência com dados calculados localmente", async () => {
    const produtoId = crypto.randomUUID();
    await database.catalogo.add({
      id: produtoId,
      nome: "Café",
      preco_padrao_centavos: 500,
      tipo: "PRODUTO",
      estoque_quantidade: null,
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

    const botaoBackup = await screen.findByRole("button", {
      name: "FAZER BACKUP AGORA"
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
});
