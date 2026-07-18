import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PdvDeBolsoDatabase } from "../database";
import { CatalogoRepository } from "./catalogoRepository";
import { ClientesRepository } from "./clientesRepository";
import { ConfiguracoesRepository } from "./configuracoesRepository";
import { TransacoesRepository } from "./transacoesRepository";

describe("repositórios do PDV", () => {
  let db: PdvDeBolsoDatabase;
  let catalogo: CatalogoRepository;
  let clientes: ClientesRepository;
  let configuracoes: ConfiguracoesRepository;
  let transacoes: TransacoesRepository;

  beforeEach(async () => {
    db = new PdvDeBolsoDatabase(`pdv-de-bolso-test-${crypto.randomUUID()}`);
    catalogo = new CatalogoRepository(db);
    clientes = new ClientesRepository(db);
    configuracoes = new ConfiguracoesRepository(db);
    transacoes = new TransacoesRepository(db);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("desativa produto sem apagar o registro", async () => {
    const produto = await catalogo.criar({
      nome: "Café grande",
      preco_padrao_centavos: 850,
      tipo: "PRODUTO",
      estoque_quantidade: null
    });

    await catalogo.desativar(produto.id);

    expect(await catalogo.listarAtivos()).toEqual([]);
    expect(await db.catalogo.get(produto.id)).toMatchObject({
      id: produto.id,
      ativo: false
    });
  });

  it("registra venda imutável com snapshot e resume o dia", async () => {
    const produto = await catalogo.criar({
      nome: "Água gelada",
      preco_padrao_centavos: 350,
      tipo: "PRODUTO",
      estoque_quantidade: null
    });
    const venda = await transacoes.registrarVendaPaga({
      metodo_pagamento: "PIX",
      itens: [
        {
          id_produto: produto.id,
          nome_produto: "Água gelada",
          quantidade: 2,
          preco_unitario_centavos: 350
        }
      ]
    });

    expect(venda).toMatchObject({
      tipo: "VENDA",
      status_pagamento: "PAGO",
      metodo_pagamento: "PIX",
      valor_total_centavos: 700,
      itens: [
        {
          nome_produto: "Água gelada",
          preco_unitario_centavos: 350
        }
      ]
    });
    expect(await transacoes.obterResumoDoDia()).toEqual({
      quantidade: 1,
      total_centavos: 700
    });
  });

  it("normaliza o telefone e persiste a chave PIX localmente", async () => {
    const cliente = await clientes.criar({
      nome: "  Maria   Silva ",
      telefone: "(11) 99999-9999",
      anotacoes: "  Prefere pagar sexta  "
    });
    await configuracoes.salvarChavePix(" contato@pdvdebolso.com ");

    expect(cliente).toMatchObject({
      nome: "Maria Silva",
      telefone: "5511999999999",
      anotacoes: "Prefere pagar sexta"
    });
    expect(await configuracoes.obterChavePix()).toBe("contato@pdvdebolso.com");
  });

  it("deriva o saldo do fiado sem alterar a venda original", async () => {
    const cliente = await clientes.criar({
      nome: "João da Feira",
      telefone: "11988887777"
    });
    const produto = await catalogo.criar({
      nome: "Marmita",
      preco_padrao_centavos: 500,
      tipo: "PRODUTO",
      estoque_quantidade: null
    });
    const venda = await transacoes.registrarVendaFiada({
      cliente_id: cliente.id,
      data_vencimento: "2026-07-10",
      itens: [
        {
          id_produto: produto.id,
          nome_produto: "Marmita",
          quantidade: 2,
          preco_unitario_centavos: 500
        }
      ]
    });

    expect(await transacoes.listarContasAReceber()).toEqual([
      expect.objectContaining({
        saldo_centavos: 1000,
        valor_pago_centavos: 0,
        status_atual: "FIADO"
      })
    ]);

    await transacoes.registrarPagamentoFiado({
      venda_id: venda.id,
      valor_centavos: 400,
      metodo_pagamento: "PIX"
    });

    expect(await transacoes.listarContasAReceber()).toEqual([
      expect.objectContaining({
        saldo_centavos: 600,
        valor_pago_centavos: 400,
        status_atual: "PARCIAL"
      })
    ]);
    await expect(
      transacoes.registrarPagamentoFiado({
        venda_id: venda.id,
        valor_centavos: 601,
        metodo_pagamento: "DINHEIRO"
      })
    ).rejects.toThrow("maior que o saldo");

    await transacoes.registrarPagamentoFiado({
      venda_id: venda.id,
      valor_centavos: 600,
      metodo_pagamento: "DINHEIRO"
    });

    expect(await transacoes.listarContasAReceber()).toEqual([]);
    expect(await db.transacoes.get(venda.id)).toMatchObject({
      status_pagamento: "FIADO",
      valor_total_centavos: 1000
    });
    expect(
      await db.transacoes.where("tipo").equals("PAGAMENTO_FIADO").count()
    ).toBe(2);
  });

  it("baixa estoque atomicamente e recusa venda sem saldo", async () => {
    const produto = await catalogo.criar({
      nome: "Bolo no pote",
      preco_padrao_centavos: 900,
      tipo: "PRODUTO",
      estoque_quantidade: 3
    });
    const item = {
      id_produto: produto.id,
      nome_produto: produto.nome,
      quantidade: 2,
      preco_unitario_centavos: produto.preco_padrao_centavos
    };

    await transacoes.registrarVendaPaga({
      metodo_pagamento: "PIX",
      itens: [item]
    });

    expect(await db.catalogo.get(produto.id)).toMatchObject({
      estoque_quantidade: 1
    });
    await expect(
      transacoes.registrarVendaPaga({
        metodo_pagamento: "DINHEIRO",
        itens: [item]
      })
    ).rejects.toThrow("Estoque insuficiente");
    expect(await db.transacoes.count()).toBe(1);
    expect(await db.catalogo.get(produto.id)).toMatchObject({
      estoque_quantidade: 1
    });
  });

  it("serviço nunca mantém quantidade de estoque", async () => {
    const servico = await catalogo.criar({
      nome: "Corte de cabelo",
      preco_padrao_centavos: 3000,
      tipo: "SERVICO",
      estoque_quantidade: 99
    });

    expect(servico.estoque_quantidade).toBeNull();
  });

  it("migra catálogo v1 sem inventar estoque", async () => {
    const nomeBanco = `pdv-de-bolso-legacy-${crypto.randomUUID()}`;
    const legado = new Dexie(nomeBanco);
    legado.version(1).stores({
      clientes: "id, nome, telefone, data_cadastro",
      catalogo: "id, nome, ativo",
      transacoes:
        "id, data_hora, tipo, cliente_id, venda_id, status_pagamento, [cliente_id+data_hora], [tipo+data_hora]",
      configuracoes: "chave"
    });
    await legado.open();
    await legado.table("catalogo").add({
      id: "item-antigo",
      nome: "Item antigo",
      preco_padrao_centavos: 1000,
      ativo: true
    });
    legado.close();

    const migrado = new PdvDeBolsoDatabase(nomeBanco);
    await migrado.open();
    expect(await migrado.catalogo.get("item-antigo")).toMatchObject({
      tipo: "PRODUTO",
      estoque_quantidade: null
    });
    await migrado.delete();
  });
});
