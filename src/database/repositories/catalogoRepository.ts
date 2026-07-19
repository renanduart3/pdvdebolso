import type { PdvDeBolsoDatabase } from "../database";
import { assertCentavos } from "../money";
import type { ProdutoCatalogo, TipoItemCatalogo } from "../types";

export type PaginaCatalogo = {
  itens: ProdutoCatalogo[];
  pagina: number;
  tamanho: number;
  total: number;
  total_paginas: number;
};

function validarNomeItem(nome: string): string {
  const nomeNormalizado = nome.trim().replace(/\s+/g, " ");

  if (!nomeNormalizado) {
    throw new TypeError("O nome do produto ou serviço é obrigatório.");
  }

  if (nomeNormalizado.length > 120) {
    throw new TypeError("O nome deve ter no máximo 120 caracteres.");
  }

  return nomeNormalizado;
}

function validarEstoque(
  tipo: TipoItemCatalogo,
  estoqueQuantidade: number | null
): number | null {
  if (tipo === "SERVICO") return null;

  if (!Number.isSafeInteger(estoqueQuantidade)) {
    throw new TypeError("O estoque deve ser um número inteiro.");
  }

  return estoqueQuantidade;
}

export class CatalogoRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async listarAtivos(): Promise<ProdutoCatalogo[]> {
    const produtos = await this.db.catalogo.toArray();

    return produtos
      .filter((produto) => produto.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async listarTodos(): Promise<ProdutoCatalogo[]> {
    const itens = await this.db.catalogo.toArray();
    return itens
      .filter((item) => item.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async listarPagina(input: {
    busca?: string;
    pagina?: number;
    tamanho?: number;
  } = {}): Promise<PaginaCatalogo> {
    const busca = input.busca?.trim() ?? "";
    const pagina = Math.max(1, Math.trunc(input.pagina ?? 1));
    const tamanho = Math.min(50, Math.max(1, Math.trunc(input.tamanho ?? 10)));
    const consultaBase = busca
      ? this.db.catalogo.where("nome").startsWithIgnoreCase(busca).reverse()
      : this.db.catalogo.orderBy("nome").reverse();
    const consulta = consultaBase.filter((item) => item.ativo);
    const total = await consulta.count();
    const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
    const paginaValida = Math.min(pagina, totalPaginas);
    const itens = await consulta
      .offset((paginaValida - 1) * tamanho)
      .limit(tamanho)
      .toArray();

    return {
      itens,
      pagina: paginaValida,
      tamanho,
      total,
      total_paginas: totalPaginas
    };
  }

  async criar(input: {
    nome: string;
    preco_padrao_centavos: number;
    tipo: TipoItemCatalogo;
    estoque_quantidade: number | null;
  }): Promise<ProdutoCatalogo> {
    const nome = validarNomeItem(input.nome);
    assertCentavos(input.preco_padrao_centavos, "preco_padrao_centavos");

    const produto: ProdutoCatalogo = {
      id: crypto.randomUUID(),
      nome,
      preco_padrao_centavos: input.preco_padrao_centavos,
      tipo: input.tipo,
      estoque_quantidade: validarEstoque(
        input.tipo,
        input.estoque_quantidade
      ),
      ativo: true
    };

    await this.db.transaction("rw", this.db.catalogo, async () => {
      await this.db.catalogo.add(produto);
    });

    return produto;
  }

  async atualizar(
    id: string,
    input: {
      nome: string;
      preco_padrao_centavos: number;
      tipo: TipoItemCatalogo;
      estoque_quantidade: number | null;
    }
  ): Promise<ProdutoCatalogo> {
    const atual = await this.db.catalogo.get(id);
    if (!atual || !atual.ativo) {
      throw new Error("Produto ou serviço não encontrado.");
    }
    const atualizado: ProdutoCatalogo = {
      ...atual,
      nome: validarNomeItem(input.nome),
      preco_padrao_centavos: input.preco_padrao_centavos,
      tipo: input.tipo,
      estoque_quantidade: validarEstoque(input.tipo, input.estoque_quantidade)
    };
    assertCentavos(atualizado.preco_padrao_centavos, "preco_padrao_centavos");
    await this.db.catalogo.put(atualizado);
    return atualizado;
  }

  async definirEstoque(id: string, estoqueQuantidade: number | null): Promise<void> {
    const item = await this.db.catalogo.get(id);
    if (!item) throw new Error("Produto ou serviço não encontrado.");
    if (item.tipo === "SERVICO") {
      throw new TypeError("Serviços não possuem estoque.");
    }

    await this.db.catalogo.update(id, {
      estoque_quantidade: validarEstoque(item.tipo, estoqueQuantidade)
    });
  }

  async reativar(id: string): Promise<void> {
    const item = await this.db.catalogo.get(id);
    if (!item) throw new Error("Produto ou serviço não encontrado.");
    await this.db.catalogo.update(id, { ativo: true });
  }

  async desativar(id: string): Promise<void> {
    const produto = await this.db.catalogo.get(id);

    if (!produto) {
      throw new Error("Produto ou serviço não encontrado.");
    }

    if (!produto.ativo) {
      return;
    }

    await this.db.transaction("rw", this.db.catalogo, async () => {
      await this.db.catalogo.update(id, { ativo: false });
    });
  }

  async excluir(id: string): Promise<"EXCLUIDO" | "ARQUIVADO"> {
    return this.db.transaction(
      "rw",
      this.db.catalogo,
      this.db.transacoes,
      async () => {
        const item = await this.db.catalogo.get(id);
        if (!item) throw new Error("Produto ou serviço não encontrado.");
        const possuiHistorico =
          (await this.db.transacoes
            .filter((transacao) =>
              transacao.itens.some((vendaItem) => vendaItem.id_produto === id)
            )
            .count()) > 0;

        if (possuiHistorico) {
          await this.db.catalogo.update(id, { ativo: false });
          return "ARQUIVADO";
        }
        await this.db.catalogo.delete(id);
        return "EXCLUIDO";
      }
    );
  }
}
