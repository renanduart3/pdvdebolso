import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PdvDeBolsoDatabase } from "../database";
import { CatalogoRepository } from "./catalogoRepository";
import { ClientesRepository } from "./clientesRepository";
import { ConfiguracoesRepository } from "./configuracoesRepository";
import { LicencaRepository } from "./licencaRepository";
import { TransacoesRepository } from "./transacoesRepository";

describe("repositórios do PDV", () => {
  let db: PdvDeBolsoDatabase;
  let catalogo: CatalogoRepository;
  let clientes: ClientesRepository;
  let configuracoes: ConfiguracoesRepository;
  let licenca: LicencaRepository;
  let transacoes: TransacoesRepository;

  beforeEach(async () => {
    db = new PdvDeBolsoDatabase(`pdv-de-bolso-test-${crypto.randomUUID()}`);
    catalogo = new CatalogoRepository(db);
    clientes = new ClientesRepository(db);
    configuracoes = new ConfiguracoesRepository(db);
    licenca = new LicencaRepository(db);
    transacoes = new TransacoesRepository(db);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("exclui produto sem histórico", async () => {
    const produto = await catalogo.criar({
      nome: "Café grande",
      preco_padrao_centavos: 850,
      tipo: "PRODUTO",
      estoque_quantidade: 0
    });

    expect(await catalogo.excluir(produto.id)).toBe("EXCLUIDO");

    expect(await catalogo.listarAtivos()).toEqual([]);
    expect(await db.catalogo.get(produto.id)).toBeUndefined();
  });

  it("registra venda imutável com snapshot e resume o dia", async () => {
    const produto = await catalogo.criar({
      nome: "Água gelada",
      preco_padrao_centavos: 350,
      tipo: "PRODUTO",
      estoque_quantidade: 10
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
      telefone_whatsapp: true,
      email: " MARIA@EXEMPLO.COM ",
      anotacoes: "  Prefere pagar sexta  "
    });
    await configuracoes.salvarChavePix(" contato@pdvdebolso.com ");

    expect(cliente).toMatchObject({
      nome: "Maria Silva",
      telefone: "5511999999999",
      telefone_whatsapp: true,
      email: "maria@exemplo.com",
      anotacoes: "Prefere pagar sexta"
    });
    expect(await configuracoes.obterChavePix()).toBe("contato@pdvdebolso.com");
  });

  it("usa o tema Impacto por padrão e persiste uma escolha válida", async () => {
    expect(await configuracoes.obterTema()).toBe("IMPACTO");

    await configuracoes.salvarTema("CONFORTO");

    expect(await configuracoes.obterTema()).toBe("CONFORTO");
    expect(await db.configuracoes.get("tema_aplicacao")).toMatchObject({
      valor: "CONFORTO"
    });
  });

  it("mantém pagamento e licença na área técnica sem tocar nos dados comerciais", async () => {
    await licenca.salvarPagamentoPendente({
      versao: 1,
      sessao_id: "sessao-pagamento-123456",
      criado_em: "2026-07-18T12:00:00.000Z"
    });

    expect(await licenca.obterEstado()).toMatchObject({
      plano: "GRATUITO",
      pagamento_pendente: {
        sessao_id: "sessao-pagamento-123456"
      }
    });

    await licenca.ativar({
      versao: 1,
      token_restauracao: "licenca-restauravel-123456",
      ativada_em: "2026-07-18T12:05:00.000Z",
      verificada_em: "2026-07-18T12:05:00.000Z"
    });

    expect(await licenca.obterEstado()).toMatchObject({
      plano: "SEM_ANUNCIOS",
      pagamento_pendente: null,
      licenca: {
        token_restauracao: "licenca-restauravel-123456"
      }
    });
    expect(await db.clientes.count()).toBe(0);
    expect(await db.catalogo.count()).toBe(0);
    expect(await db.transacoes.count()).toBe(0);
  });

  it("edita cliente e produto sem alterar seus identificadores", async () => {
    const cliente = await clientes.criar({ nome: "Nome antigo" });
    const produto = await catalogo.criar({
      nome: "Produto antigo",
      preco_padrao_centavos: 100,
      tipo: "PRODUTO",
      estoque_quantidade: 2
    });

    const clienteAtualizado = await clientes.atualizar(cliente.id, {
      nome: "Nome novo",
      telefone: "11999998888",
      telefone_whatsapp: true,
      email: "novo@exemplo.com",
      anotacoes: "Atualizado"
    });
    const produtoAtualizado = await catalogo.atualizar(produto.id, {
      nome: "Serviço novo",
      preco_padrao_centavos: 250,
      tipo: "SERVICO",
      estoque_quantidade: 99
    });

    expect(clienteAtualizado).toMatchObject({
      id: cliente.id,
      nome: "Nome novo",
      telefone_whatsapp: true,
      email: "novo@exemplo.com"
    });
    expect(produtoAtualizado).toMatchObject({
      id: produto.id,
      nome: "Serviço novo",
      tipo: "SERVICO",
      estoque_quantidade: null
    });
  });

  it("pagina catálogo em ordem decrescente e busca por prefixo indexado", async () => {
    for (const nome of ["Abacaxi", "Bolo", "Café", "Caju"]) {
      await catalogo.criar({
        nome,
        preco_padrao_centavos: 100,
        tipo: "PRODUTO",
        estoque_quantidade: 0
      });
    }

    const primeiraPagina = await catalogo.listarPagina({ pagina: 1, tamanho: 2 });
    expect(primeiraPagina).toMatchObject({
      total: 4,
      total_paginas: 2,
      pagina: 1
    });
    expect(primeiraPagina.itens.map((item) => item.nome)).toEqual(["Caju", "Café"]);

    const busca = await catalogo.listarPagina({ busca: "ca", tamanho: 10 });
    expect(busca.itens.map((item) => item.nome)).toEqual(["Caju", "Café"]);
  });

  it("pagina clientes recentes, busca telefone e confirma regra de exclusão", async () => {
    const antigo = await clientes.criar({
      nome: "Ana",
      telefone: "11911112222"
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const recente = await clientes.criar({
      nome: "Bruno",
      telefone: "11999998888"
    });

    expect(
      (await clientes.listarPagina({ tamanho: 1 })).itens[0].id
    ).toBe(recente.id);
    expect(
      (await clientes.listarPagina({ busca: "1199" })).itens[0].id
    ).toBe(recente.id);

    await clientes.excluir(antigo.id);
    expect(await db.clientes.get(antigo.id)).toBeUndefined();

    const produto = await catalogo.criar({
      nome: "Serviço",
      preco_padrao_centavos: 100,
      tipo: "SERVICO",
      estoque_quantidade: null
    });
    await transacoes.registrarVendaFiada({
      cliente_id: recente.id,
      data_vencimento: "2026-08-01",
      itens: [{
        id_produto: produto.id,
        nome_produto: produto.nome,
        quantidade: 1,
        preco_unitario_centavos: 100
      }]
    });

    expect(await clientes.excluir(recente.id)).toBe("ARQUIVADO");
    expect(await db.clientes.get(recente.id)).toMatchObject({ ativo: false });
    expect((await clientes.listar()).map((cliente) => cliente.id)).not.toContain(
      recente.id
    );
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
      estoque_quantidade: 10
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
    await configuracoes.salvarValidacaoEstoque(true);
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

  it("registra fiado avulso e cancela por novo lançamento imutável", async () => {
    const cliente = await clientes.criar({
      nome: "Cliente avulso",
      telefone: "11999990000",
      telefone_whatsapp: true
    });
    const venda = await transacoes.registrarVendaFiada({
      cliente_id: cliente.id,
      data_vencimento: "2026-08-10",
      descricao: "Compra anotada manualmente",
      itens: [{
        id_produto: null,
        nome_produto: "Compra anotada manualmente",
        quantidade: 1,
        preco_unitario_centavos: 2750
      }]
    });

    expect((await transacoes.listarContasAReceber())[0]).toMatchObject({
      saldo_centavos: 2750
    });
    await transacoes.cancelarVenda(venda.id, "Lançamento duplicado");

    expect(await transacoes.listarContasAReceber()).toEqual([]);
    expect(await db.transacoes.get(venda.id)).toMatchObject({
      tipo: "VENDA",
      status_pagamento: "FIADO"
    });
    expect(
      await db.transacoes.where("tipo").equals("CANCELAMENTO_VENDA").count()
    ).toBe(1);
  });

  it("restaura estoque ao cancelar e bloqueia cancelamento após pagamento", async () => {
    const cliente = await clientes.criar({ nome: "Carlos" });
    const produto = await catalogo.criar({
      nome: "Caixa",
      preco_padrao_centavos: 1000,
      tipo: "PRODUTO",
      estoque_quantidade: 5
    });
    const criarVenda = () =>
      transacoes.registrarVendaFiada({
        cliente_id: cliente.id,
        data_vencimento: "2026-08-10",
        itens: [{
          id_produto: produto.id,
          nome_produto: produto.nome,
          quantidade: 2,
          preco_unitario_centavos: 1000
        }]
      });

    const cancelada = await criarVenda();
    expect((await db.catalogo.get(produto.id))?.estoque_quantidade).toBe(3);
    await transacoes.cancelarVenda(cancelada.id);
    expect((await db.catalogo.get(produto.id))?.estoque_quantidade).toBe(5);

    const parcialmentePaga = await criarVenda();
    await transacoes.registrarPagamentoFiado({
      venda_id: parcialmentePaga.id,
      valor_centavos: 500,
      metodo_pagamento: "PIX"
    });
    await expect(
      transacoes.cancelarVenda(parcialmentePaga.id)
    ).rejects.toThrow("já possui pagamentos");
  });

  it("migra catálogo v1 para estoque zero e schema de cliente v3", async () => {
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
    await legado.table("clientes").add({
      id: "cliente-antigo",
      nome: "Cliente antigo",
      telefone: "5511999999999",
      anotacoes: null,
      data_cadastro: "2026-01-01T12:00:00.000Z"
    });
    legado.close();

    const migrado = new PdvDeBolsoDatabase(nomeBanco);
    await migrado.open();
    expect(await migrado.catalogo.get("item-antigo")).toMatchObject({
      tipo: "PRODUTO",
      estoque_quantidade: 0
    });
    expect(await migrado.clientes.get("cliente-antigo")).toMatchObject({
      telefone_whatsapp: true,
      email: null,
      ativo: true
    });
    await migrado.delete();
  });
});
