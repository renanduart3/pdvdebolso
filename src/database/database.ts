import Dexie, { type EntityTable } from "dexie";

import type {
  Cliente,
  ConfiguracaoTecnica,
  ProdutoCatalogo,
  Transacao
} from "./types";

export class PdvDeBolsoDatabase extends Dexie {
  clientes!: EntityTable<Cliente, "id">;
  catalogo!: EntityTable<ProdutoCatalogo, "id">;
  transacoes!: EntityTable<Transacao, "id">;
  configuracoes!: EntityTable<ConfiguracaoTecnica, "chave">;

  constructor(databaseName = "pdv-de-bolso") {
    super(databaseName);

    this.version(1).stores({
      clientes: "id, nome, telefone, data_cadastro",
      catalogo: "id, nome, ativo",
      transacoes:
        "id, data_hora, tipo, cliente_id, venda_id, status_pagamento, [cliente_id+data_hora], [tipo+data_hora]",
      configuracoes: "chave"
    });

    this.version(2)
      .stores({
        clientes: "id, nome, telefone, data_cadastro",
        catalogo: "id, nome, ativo, tipo",
        transacoes:
          "id, data_hora, tipo, cliente_id, venda_id, status_pagamento, [cliente_id+data_hora], [tipo+data_hora]",
        configuracoes: "chave"
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("catalogo")
          .toCollection()
          .modify((item: Record<string, unknown>) => {
            if (item.tipo !== "PRODUTO" && item.tipo !== "SERVICO") {
              item.tipo = "PRODUTO";
            }
            if (
              !Number.isSafeInteger(item.estoque_quantidade) ||
              Number(item.estoque_quantidade) < 0
            ) {
              item.estoque_quantidade = null;
            }
          });
      });

    this.version(3)
      .stores({
        clientes: "id, nome, telefone, data_cadastro, ativo",
        catalogo: "id, nome, ativo, tipo",
        transacoes:
          "id, data_hora, tipo, cliente_id, venda_id, status_pagamento, [cliente_id+data_hora], [tipo+data_hora]",
        configuracoes: "chave"
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("clientes")
          .toCollection()
          .modify((cliente: Record<string, unknown>) => {
            cliente.telefone_whatsapp =
              typeof cliente.telefone === "string" && cliente.telefone.length > 0;
            cliente.email = null;
            cliente.ativo = true;
          });
        await transaction
          .table("catalogo")
          .toCollection()
          .modify((item: Record<string, unknown>) => {
            if (item.tipo === "SERVICO") {
              item.estoque_quantidade = null;
            } else if (!Number.isSafeInteger(item.estoque_quantidade)) {
              item.estoque_quantidade = 0;
            }
          });
        await transaction
          .table("transacoes")
          .toCollection()
          .modify((transacao: Record<string, unknown>) => {
            transacao.descricao = null;
          });
        await transaction.table("configuracoes").put({
          chave: "validar_estoque_venda",
          valor: false
        });
      });
  }
}

export const database = new PdvDeBolsoDatabase();
