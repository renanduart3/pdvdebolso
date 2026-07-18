import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PdvDeBolsoDatabase } from "../database";
import { BackupRepository, validarBackup } from "./backupRepository";

describe("BackupRepository", () => {
  let db: PdvDeBolsoDatabase;
  let backup: BackupRepository;

  beforeEach(async () => {
    db = new PdvDeBolsoDatabase(`pdv-backup-test-${crypto.randomUUID()}`);
    backup = new BackupRepository(db);
    await db.open();
    await db.clientes.add({
      id: "cliente-1",
      nome: "Maria",
      telefone: "5511999999999",
      anotacoes: null,
      data_cadastro: "2026-07-01T12:00:00.000Z"
    });
    await db.catalogo.add({
      id: "produto-1",
      nome: "Café",
      preco_padrao_centavos: 500,
      tipo: "PRODUTO",
      estoque_quantidade: 10,
      ativo: true
    });
    await db.transacoes.add({
      id: "venda-1",
      data_hora: "2026-07-10T12:00:00.000Z",
      tipo: "VENDA",
      cliente_id: null,
      venda_id: null,
      data_vencimento: null,
      valor_total_centavos: 500,
      status_pagamento: "PAGO",
      metodo_pagamento: "PIX",
      itens: [
        {
          id_produto: "produto-1",
          nome_produto: "Café",
          quantidade: 1,
          preco_unitario_centavos: 500
        }
      ]
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it("exporta, valida e restaura todas as coleções", async () => {
    const agora = new Date("2026-07-18T12:00:00.000Z");
    const exportado = await backup.exportar(agora);
    const conteudo = validarBackup(JSON.parse(exportado.conteudo));

    expect(exportado.nome_arquivo).toBe("pdv-de-bolso-backup-2026-07-18.json");
    expect(conteudo.dados.transacoes).toHaveLength(1);
    expect(await backup.precisaBackup(agora)).toBe(false);

    await db.clientes.clear();
    await db.catalogo.clear();
    await db.transacoes.clear();
    await backup.importar(exportado.conteudo);

    expect(await db.clientes.count()).toBe(1);
    expect(await db.catalogo.count()).toBe(1);
    expect(await db.transacoes.count()).toBe(1);
  });

  it("recusa arquivo corrompido sem apagar os dados atuais", async () => {
    const corrompido = JSON.stringify({
      formato: "pdv-de-bolso",
      versao: 1,
      schema_banco: 2,
      exportado_em: new Date().toISOString(),
      dados: {
        clientes: [],
        catalogo: [],
        configuracoes: [],
        transacoes: [
          {
            id: "venda-invalida"
          }
        ]
      }
    });

    await expect(backup.importar(corrompido)).rejects.toThrow(
      "dados inválidos"
    );
    expect(await db.clientes.count()).toBe(1);
    expect(await db.catalogo.count()).toBe(1);
    expect(await db.transacoes.count()).toBe(1);
  });

  it("cobra backup após 14 dias e não alerta banco vazio", async () => {
    expect(
      await backup.precisaBackup(new Date("2026-07-18T12:00:00.000Z"))
    ).toBe(true);
    await backup.exportar(new Date("2026-07-01T12:00:00.000Z"));
    expect(
      await backup.precisaBackup(new Date("2026-07-15T12:00:00.000Z"))
    ).toBe(true);

    await db.clientes.clear();
    await db.catalogo.clear();
    await db.transacoes.clear();
    expect(
      await backup.precisaBackup(new Date("2026-08-20T12:00:00.000Z"))
    ).toBe(false);
  });
});
