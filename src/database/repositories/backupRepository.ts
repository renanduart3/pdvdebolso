import type { PdvDeBolsoDatabase } from "../database";
import type {
  Cliente,
  ConfiguracaoTecnica,
  ItemTransacao,
  ProdutoCatalogo,
  Transacao
} from "../types";

const FORMATO = "pdv-de-bolso";
const VERSAO_BACKUP = 2;
const ULTIMO_BACKUP_KEY = "ultimo_backup_em";
const QUINZE_DIAS_MS = 14 * 24 * 60 * 60 * 1000;

export type BackupPdv = {
  formato: typeof FORMATO;
  versao: typeof VERSAO_BACKUP;
  schema_banco: 3;
  exportado_em: string;
  dados: {
    clientes: Cliente[];
    catalogo: ProdutoCatalogo[];
    transacoes: Transacao[];
    configuracoes: ConfiguracaoTecnica[];
  };
};

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function texto(value: unknown): value is string {
  return typeof value === "string";
}

function textoNaoVazio(value: unknown): value is string {
  return texto(value) && value.trim().length > 0;
}

function dataIso(value: unknown): value is string {
  return texto(value) && !Number.isNaN(new Date(value).getTime());
}

function centavos(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validarCliente(value: unknown): value is Cliente {
  return (
    objeto(value) &&
    textoNaoVazio(value.id) &&
    textoNaoVazio(value.nome) &&
    (value.telefone === null || texto(value.telefone)) &&
    typeof value.telefone_whatsapp === "boolean" &&
    (value.email === null || texto(value.email)) &&
    (value.anotacoes === null || texto(value.anotacoes)) &&
    dataIso(value.data_cadastro) &&
    typeof value.ativo === "boolean"
  );
}

function validarCatalogo(value: unknown): value is ProdutoCatalogo {
  if (
    !objeto(value) ||
    !textoNaoVazio(value.id) ||
    !textoNaoVazio(value.nome) ||
    !centavos(value.preco_padrao_centavos) ||
    (value.tipo !== "PRODUTO" && value.tipo !== "SERVICO") ||
    typeof value.ativo !== "boolean"
  ) {
    return false;
  }

  if (value.tipo === "SERVICO") return value.estoque_quantidade === null;
  return Number.isSafeInteger(value.estoque_quantidade);
}

function validarItem(value: unknown): value is ItemTransacao {
  return (
    objeto(value) &&
    (value.id_produto === null || textoNaoVazio(value.id_produto)) &&
    textoNaoVazio(value.nome_produto) &&
    Number.isSafeInteger(value.quantidade) &&
    Number(value.quantidade) > 0 &&
    centavos(value.preco_unitario_centavos)
  );
}

function validarTransacao(value: unknown): value is Transacao {
  if (
    !objeto(value) ||
    !textoNaoVazio(value.id) ||
    !dataIso(value.data_hora) ||
    !["VENDA", "PAGAMENTO_FIADO", "CANCELAMENTO_VENDA"].includes(
      String(value.tipo)
    ) ||
    (value.cliente_id !== null && !textoNaoVazio(value.cliente_id)) ||
    (value.venda_id !== null && !textoNaoVazio(value.venda_id)) ||
    (value.data_vencimento !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(value.data_vencimento))) ||
    !centavos(value.valor_total_centavos) ||
    !["PAGO", "FIADO", "PARCIAL", "CANCELADO"].includes(
      String(value.status_pagamento)
    ) ||
    !(
      value.metodo_pagamento === null ||
      ["PIX", "DINHEIRO", "CARTAO"].includes(String(value.metodo_pagamento))
    ) ||
    (value.descricao !== null && !texto(value.descricao)) ||
    !Array.isArray(value.itens) ||
    !value.itens.every(validarItem)
  ) {
    return false;
  }

  if (value.tipo === "PAGAMENTO_FIADO") {
    return (
      textoNaoVazio(value.cliente_id) &&
      textoNaoVazio(value.venda_id) &&
      value.data_vencimento === null &&
      value.status_pagamento === "PAGO" &&
      value.metodo_pagamento !== null &&
      value.itens.length === 0
    );
  }

  if (value.tipo === "CANCELAMENTO_VENDA") {
    return (
      textoNaoVazio(value.venda_id) &&
      value.data_vencimento === null &&
      value.status_pagamento === "CANCELADO" &&
      value.metodo_pagamento === null &&
      value.itens.length === 0
    );
  }

  if (value.venda_id !== null || value.itens.length === 0) return false;
  const totalItens = value.itens.reduce(
    (total, item) =>
      total + Number(item.quantidade) * Number(item.preco_unitario_centavos),
    0
  );
  return Number.isSafeInteger(totalItens) && totalItens === value.valor_total_centavos;
}

function validarConfiguracao(value: unknown): value is ConfiguracaoTecnica {
  return objeto(value) && textoNaoVazio(value.chave) && "valor" in value;
}

function idsUnicos(itens: Array<{ id: string }>): boolean {
  return new Set(itens.map((item) => item.id)).size === itens.length;
}

export function validarBackup(value: unknown): BackupPdv {
  if (
    objeto(value) &&
    value.formato === FORMATO &&
    value.versao === 1 &&
    value.schema_banco === 2 &&
    dataIso(value.exportado_em) &&
    objeto(value.dados)
  ) {
    const dadosAntigos = value.dados;
    if (
      Array.isArray(dadosAntigos.clientes) &&
      Array.isArray(dadosAntigos.catalogo) &&
      Array.isArray(dadosAntigos.transacoes) &&
      Array.isArray(dadosAntigos.configuracoes)
    ) {
      value = {
        formato: FORMATO,
        versao: VERSAO_BACKUP,
        schema_banco: 3,
        exportado_em: value.exportado_em,
        dados: {
          clientes: dadosAntigos.clientes.map((cliente) =>
            objeto(cliente)
              ? {
                  ...cliente,
                  telefone_whatsapp:
                    typeof cliente.telefone === "string" &&
                    cliente.telefone.length > 0,
                  email: null,
                  ativo: true
                }
              : cliente
          ),
          catalogo: dadosAntigos.catalogo.map((item) =>
            objeto(item)
              ? {
                  ...item,
                  estoque_quantidade:
                    item.tipo === "SERVICO"
                      ? null
                      : Number.isSafeInteger(item.estoque_quantidade)
                        ? item.estoque_quantidade
                        : 0
                }
              : item
          ),
          transacoes: dadosAntigos.transacoes.map((transacao) =>
            objeto(transacao) ? { ...transacao, descricao: null } : transacao
          ),
          configuracoes: [
            ...dadosAntigos.configuracoes,
            ...(dadosAntigos.configuracoes.some(
              (item) =>
                objeto(item) && item.chave === "validar_estoque_venda"
            )
              ? []
              : [{ chave: "validar_estoque_venda", valor: false }])
          ]
        }
      };
    }
  }

  if (
    !objeto(value) ||
    value.formato !== FORMATO ||
    value.versao !== VERSAO_BACKUP ||
    value.schema_banco !== 3 ||
    !dataIso(value.exportado_em) ||
    !objeto(value.dados)
  ) {
    throw new TypeError("O arquivo não é um backup válido do PDV de Bolso.");
  }

  const { clientes, catalogo, transacoes, configuracoes } = value.dados;
  if (
    !Array.isArray(clientes) ||
    !clientes.every(validarCliente) ||
    !Array.isArray(catalogo) ||
    !catalogo.every(validarCatalogo) ||
    !Array.isArray(transacoes) ||
    !transacoes.every(validarTransacao) ||
    !Array.isArray(configuracoes) ||
    !configuracoes.every(validarConfiguracao)
  ) {
    throw new TypeError("O backup contém dados inválidos ou incompletos.");
  }

  if (
    !idsUnicos(clientes) ||
    !idsUnicos(catalogo) ||
    !idsUnicos(transacoes) ||
    new Set(configuracoes.map((item) => item.chave)).size !== configuracoes.length
  ) {
    throw new TypeError("O backup contém identificadores duplicados.");
  }

  const clientesIds = new Set(clientes.map((item) => item.id));
  const catalogoIds = new Set(catalogo.map((item) => item.id));
  const vendasIds = new Set(
    transacoes
      .filter((item) => item.tipo === "VENDA")
      .map((item) => item.id)
  );
  for (const transacao of transacoes) {
    if (transacao.cliente_id && !clientesIds.has(transacao.cliente_id)) {
      throw new TypeError("O backup referencia um cliente inexistente.");
    }
    if (
      (transacao.tipo === "PAGAMENTO_FIADO" ||
        transacao.tipo === "CANCELAMENTO_VENDA") &&
      (!transacao.venda_id || !vendasIds.has(transacao.venda_id))
    ) {
      throw new TypeError("O backup referencia uma venda fiada inexistente.");
    }
    for (const item of transacao.itens) {
      if (item.id_produto && !catalogoIds.has(item.id_produto)) {
        throw new TypeError("O backup referencia um item de catálogo inexistente.");
      }
    }
  }

  return value as BackupPdv;
}

export class BackupRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async exportar(agora = new Date()): Promise<{
    conteudo: string;
    nome_arquivo: string;
    exportado_em: string;
  }> {
    const exportadoEm = agora.toISOString();
    const dados = await this.db.transaction(
      "rw",
      this.db.clientes,
      this.db.catalogo,
      this.db.transacoes,
      this.db.configuracoes,
      async () => {
        await this.db.configuracoes.put({
          chave: ULTIMO_BACKUP_KEY,
          valor: exportadoEm
        });
        const [clientes, catalogo, transacoes, configuracoes] = await Promise.all([
          this.db.clientes.toArray(),
          this.db.catalogo.toArray(),
          this.db.transacoes.toArray(),
          this.db.configuracoes.toArray()
        ]);
        return { clientes, catalogo, transacoes, configuracoes };
      }
    );
    const backup: BackupPdv = {
      formato: FORMATO,
      versao: VERSAO_BACKUP,
      schema_banco: 3,
      exportado_em: exportadoEm,
      dados
    };
    const dataArquivo = exportadoEm.slice(0, 10);
    return {
      conteudo: JSON.stringify(backup, null, 2),
      nome_arquivo: `pdv-de-bolso-backup-${dataArquivo}.json`,
      exportado_em: exportadoEm
    };
  }

  async importar(conteudo: string): Promise<BackupPdv> {
    let parseado: unknown;
    try {
      parseado = JSON.parse(conteudo);
    } catch {
      throw new TypeError("O arquivo selecionado não contém um JSON válido.");
    }
    const backup = validarBackup(parseado);

    await this.db.transaction(
      "rw",
      this.db.clientes,
      this.db.catalogo,
      this.db.transacoes,
      this.db.configuracoes,
      async () => {
        await Promise.all([
          this.db.clientes.clear(),
          this.db.catalogo.clear(),
          this.db.transacoes.clear(),
          this.db.configuracoes.clear()
        ]);
        await this.db.clientes.bulkAdd(backup.dados.clientes);
        await this.db.catalogo.bulkAdd(backup.dados.catalogo);
        await this.db.transacoes.bulkAdd(backup.dados.transacoes);
        await this.db.configuracoes.bulkAdd(backup.dados.configuracoes);
        if (
          !backup.dados.configuracoes.some(
            (item) => item.chave === ULTIMO_BACKUP_KEY
          )
        ) {
          await this.db.configuracoes.put({
            chave: ULTIMO_BACKUP_KEY,
            valor: backup.exportado_em
          });
        }
      }
    );

    return backup;
  }

  async obterUltimoBackup(): Promise<string | null> {
    const item = await this.db.configuracoes.get(ULTIMO_BACKUP_KEY);
    return dataIso(item?.valor) ? item.valor : null;
  }

  async precisaBackup(agora = new Date()): Promise<boolean> {
    const [clientes, catalogo, transacoes, ultimoBackup] = await Promise.all([
      this.db.clientes.count(),
      this.db.catalogo.count(),
      this.db.transacoes.count(),
      this.obterUltimoBackup()
    ]);
    if (clientes + catalogo + transacoes === 0) return false;
    if (!ultimoBackup) return true;
    return agora.getTime() - new Date(ultimoBackup).getTime() >= QUINZE_DIAS_MS;
  }
}
