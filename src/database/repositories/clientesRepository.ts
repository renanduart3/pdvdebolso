import type { PdvDeBolsoDatabase } from "../database";
import type { Cliente } from "../types";

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

export class ClientesRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async listar(): Promise<Cliente[]> {
    const clientes = await this.db.clientes.toArray();
    return clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async criar(input: {
    nome: string;
    telefone?: string;
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
      anotacoes: normalizarTextoOpcional(input.anotacoes ?? ""),
      data_cadastro: new Date().toISOString()
    };

    await this.db.transaction("rw", this.db.clientes, async () => {
      await this.db.clientes.add(cliente);
    });

    return cliente;
  }
}

