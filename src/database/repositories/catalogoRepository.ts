import type { PdvDeBolsoDatabase } from "../database";
import { assertCentavos } from "../money";
import type { ProdutoCatalogo, TipoItemCatalogo } from "../types";

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
  if (estoqueQuantidade === null) return null;

  if (!Number.isSafeInteger(estoqueQuantidade) || estoqueQuantidade < 0) {
    throw new TypeError("O estoque deve ser um número inteiro não negativo.");
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
    return itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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
}
