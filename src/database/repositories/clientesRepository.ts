import type { PdvDeBolsoDatabase } from "../database";
import type { Cliente } from "../types";

export type PaginaClientes = {
  itens: Cliente[];
  pagina: number;
  tamanho: number;
  total: number;
  total_paginas: number;
};

export function normalizarTelefoneWhatsApp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");

  if (!digitos) return null;

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  if (digitos.length < 12 || digitos.length > 15) {
    throw new TypeError("Informe um telefone com DDD e, se necessário, código do país.");
  }

  return digitos;
}

function normalizarTextoOpcional(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizarEmail(email: string): string | null {
  const normalizado = email.trim().toLocaleLowerCase("pt-BR");
  if (!normalizado) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
    throw new TypeError("Informe um e-mail válido.");
  }
  return normalizado;
}

export class ClientesRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async listar(): Promise<Cliente[]> {
    const clientes = await this.db.clientes.toArray();
    return clientes
      .filter((cliente) => cliente.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async listarPagina(input: {
    busca?: string;
    pagina?: number;
    tamanho?: number;
  } = {}): Promise<PaginaClientes> {
    const busca = input.busca?.trim() ?? "";
    const pagina = Math.max(1, Math.trunc(input.pagina ?? 1));
    const tamanho = Math.min(50, Math.max(1, Math.trunc(input.tamanho ?? 10)));
    const digitos = busca.replace(/\D/g, "");
    const buscaPorTelefone = Boolean(digitos) && !/[a-zÀ-ÿ]/i.test(busca);
    const consultaBase = busca
      ? buscaPorTelefone
        ? this.db.clientes
            .where("telefone")
            .startsWith(digitos.startsWith("55") ? digitos : `55${digitos}`)
            .reverse()
        : this.db.clientes.where("nome").startsWithIgnoreCase(busca).reverse()
      : this.db.clientes.orderBy("data_cadastro").reverse();
    const consulta = consultaBase.filter((cliente) => cliente.ativo);
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
    telefone?: string;
    telefone_whatsapp?: boolean;
    email?: string;
    anotacoes?: string;
  }): Promise<Cliente> {
    const nome = input.nome.trim().replace(/\s+/g, " ");

    if (!nome) {
      throw new TypeError("O nome do cliente é obrigatório.");
    }

    if (nome.length > 120) {
      throw new TypeError("O nome do cliente deve ter no máximo 120 caracteres.");
    }

    const cliente: Cliente = {
      id: crypto.randomUUID(),
      nome,
      telefone: normalizarTelefoneWhatsApp(input.telefone ?? ""),
      telefone_whatsapp: Boolean(input.telefone_whatsapp && input.telefone),
      email: normalizarEmail(input.email ?? ""),
      anotacoes: normalizarTextoOpcional(input.anotacoes ?? ""),
      data_cadastro: new Date().toISOString(),
      ativo: true
    };

    await this.db.transaction("rw", this.db.clientes, async () => {
      await this.db.clientes.add(cliente);
    });

    return cliente;
  }

  async atualizar(
    id: string,
    input: {
      nome: string;
      telefone?: string;
      telefone_whatsapp?: boolean;
      email?: string;
      anotacoes?: string;
    }
  ): Promise<Cliente> {
    const atual = await this.db.clientes.get(id);
    if (!atual || !atual.ativo) throw new Error("Cliente não encontrado.");
    const nome = input.nome.trim().replace(/\s+/g, " ");
    if (!nome) throw new TypeError("O nome do cliente é obrigatório.");
    if (nome.length > 120) {
      throw new TypeError("O nome do cliente deve ter no máximo 120 caracteres.");
    }
    const telefone = normalizarTelefoneWhatsApp(input.telefone ?? "");
    const atualizado: Cliente = {
      ...atual,
      nome,
      telefone,
      telefone_whatsapp: Boolean(input.telefone_whatsapp && telefone),
      email: normalizarEmail(input.email ?? ""),
      anotacoes: normalizarTextoOpcional(input.anotacoes ?? "")
    };
    await this.db.clientes.put(atualizado);
    return atualizado;
  }

  async excluir(id: string): Promise<"EXCLUIDO" | "ARQUIVADO"> {
    return this.db.transaction(
      "rw",
      this.db.clientes,
      this.db.transacoes,
      async () => {
        const cliente = await this.db.clientes.get(id);
        if (!cliente) throw new Error("Cliente não encontrado.");

        const possuiHistorico =
          (await this.db.transacoes.where("cliente_id").equals(id).count()) > 0;
        if (possuiHistorico) {
          await this.db.clientes.update(id, { ativo: false });
          return "ARQUIVADO";
        }
        await this.db.clientes.delete(id);
        return "EXCLUIDO";
      }
    );
  }
}
