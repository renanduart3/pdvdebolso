import type { PdvDeBolsoDatabase } from "../database";
import { calcularTotalItensCentavos } from "../money";
import { assertCentavos } from "../money";
import type {
  Cliente,
  ItemTransacao,
  MetodoPagamento,
  StatusPagamento,
  Transacao
} from "../types";

export type ResumoVendas = {
  quantidade: number;
  total_centavos: number;
};

export type ContaReceber = {
  venda: Transacao;
  cliente: Cliente;
  valor_pago_centavos: number;
  saldo_centavos: number;
  status_atual: Extract<StatusPagamento, "FIADO" | "PARCIAL">;
  dias_atraso: number;
};

function inicioEFimDoDia(data: Date): [string, string] {
  const inicio = new Date(data);
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);

  return [inicio.toISOString(), fim.toISOString()];
}

function validarDataVencimento(dataVencimento: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento)) {
    throw new TypeError("Informe uma data de vencimento válida.");
  }

  const data = new Date(`${dataVencimento}T00:00:00`);
  if (Number.isNaN(data.getTime())) {
    throw new TypeError("Informe uma data de vencimento válida.");
  }

  return dataVencimento;
}

function calcularDiasAtraso(dataVencimento: string, hoje = new Date()): number {
  const vencimento = new Date(`${dataVencimento}T00:00:00`);
  const inicioHoje = new Date(hoje);
  inicioHoje.setHours(0, 0, 0, 0);

  return Math.max(
    0,
    Math.floor((inicioHoje.getTime() - vencimento.getTime()) / 86_400_000)
  );
}

function validarItens(itensEntrada: ItemTransacao[]): {
  itens: ItemTransacao[];
  total_centavos: number;
} {
  if (itensEntrada.length === 0) {
    throw new TypeError("Adicione pelo menos um produto à venda.");
  }

  const itens = itensEntrada.map((item) => ({
    ...item,
    nome_produto: item.nome_produto.trim()
  }));

  for (const [index, item] of itens.entries()) {
    if (!item.nome_produto) {
      throw new TypeError(`O item ${index + 1} possui dados inválidos.`);
    }
  }

  return {
    itens,
    total_centavos: calcularTotalItensCentavos(itens)
  };
}

function normalizarDescricao(descricao?: string): string | null {
  const normalizada = descricao?.trim().replace(/\s+/g, " ") ?? "";
  return normalizada || null;
}

export class TransacoesRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  private async baixarEstoque(itens: ItemTransacao[]): Promise<void> {
    const quantidades = new Map<string, number>();
    for (const item of itens) {
      if (!item.id_produto) continue;
      quantidades.set(
        item.id_produto,
        (quantidades.get(item.id_produto) ?? 0) + item.quantidade
      );
    }

    const ids = [...quantidades.keys()];
    if (ids.length === 0) return;
    const catalogo = await this.db.catalogo.bulkGet(ids);
    const validarEstoque =
      (await this.db.configuracoes.get("validar_estoque_venda"))?.valor === true;

    for (const [index, item] of catalogo.entries()) {
      if (!item || !item.ativo) {
        throw new Error(
          `${itens.find((vendaItem) => vendaItem.id_produto === ids[index])?.nome_produto ?? "Item"} não está disponível no catálogo.`
        );
      }

      if (item.tipo === "SERVICO" || item.estoque_quantidade === null) continue;

      const quantidadeVendida = quantidades.get(item.id) ?? 0;
      if (validarEstoque && item.estoque_quantidade < quantidadeVendida) {
        throw new TypeError(
          `Estoque insuficiente para ${item.nome}. Disponível: ${item.estoque_quantidade}.`
        );
      }

      await this.db.catalogo.update(item.id, {
        estoque_quantidade: item.estoque_quantidade - quantidadeVendida
      });
    }
  }

  async registrarVendaPaga(input: {
    itens: ItemTransacao[];
    metodo_pagamento: MetodoPagamento;
    descricao?: string;
    data_hora?: string;
  }): Promise<Transacao> {
    const { itens, total_centavos } = validarItens(input.itens);

    const transacao: Transacao = {
      id: crypto.randomUUID(),
      data_hora: input.data_hora ?? new Date().toISOString(),
      tipo: "VENDA",
      cliente_id: null,
      venda_id: null,
      data_vencimento: null,
      valor_total_centavos: total_centavos,
      status_pagamento: "PAGO",
      metodo_pagamento: input.metodo_pagamento,
      descricao: normalizarDescricao(input.descricao),
      itens
    };

    await this.db.transaction(
      "rw",
      this.db.catalogo,
      this.db.transacoes,
      this.db.configuracoes,
      async () => {
        await this.baixarEstoque(itens);
        await this.db.transacoes.add(transacao);
      }
    );

    return transacao;
  }

  async registrarVendaFiada(input: {
    itens: ItemTransacao[];
    cliente_id: string;
    data_vencimento: string;
    descricao?: string;
    data_hora?: string;
  }): Promise<Transacao> {
    const cliente = await this.db.clientes.get(input.cliente_id);

    if (!cliente || !cliente.ativo) {
      throw new TypeError("Selecione um cliente válido para o fiado.");
    }

    const { itens, total_centavos } = validarItens(input.itens);
    const transacao: Transacao = {
      id: crypto.randomUUID(),
      data_hora: input.data_hora ?? new Date().toISOString(),
      tipo: "VENDA",
      cliente_id: cliente.id,
      venda_id: null,
      data_vencimento: validarDataVencimento(input.data_vencimento),
      valor_total_centavos: total_centavos,
      status_pagamento: "FIADO",
      metodo_pagamento: null,
      descricao: normalizarDescricao(input.descricao),
      itens
    };

    await this.db.transaction(
      "rw",
      this.db.catalogo,
      this.db.transacoes,
      this.db.configuracoes,
      async () => {
        await this.baixarEstoque(itens);
        await this.db.transacoes.add(transacao);
      }
    );

    return transacao;
  }

  async registrarPagamentoFiado(input: {
    venda_id: string;
    valor_centavos: number;
    metodo_pagamento: MetodoPagamento;
  }): Promise<Transacao> {
    assertCentavos(input.valor_centavos, "valor_centavos");

    if (input.valor_centavos === 0) {
      throw new TypeError("O pagamento deve ser maior que zero.");
    }

    return this.db.transaction("rw", this.db.transacoes, async () => {
      const venda = await this.db.transacoes.get(input.venda_id);
      const cancelada =
        (await this.db.transacoes
          .where("venda_id")
          .equals(input.venda_id)
          .filter((item) => item.tipo === "CANCELAMENTO_VENDA")
          .count()) > 0;

      if (
        !venda ||
        venda.tipo !== "VENDA" ||
        !venda.cliente_id ||
        venda.status_pagamento === "PAGO" ||
        cancelada
      ) {
        throw new Error("Venda fiada não encontrada.");
      }

      const pagamentos = await this.db.transacoes
        .where("venda_id")
        .equals(venda.id)
        .filter((transacao) => transacao.tipo === "PAGAMENTO_FIADO")
        .toArray();
      const valorPago = pagamentos.reduce(
        (total, pagamento) => total + pagamento.valor_total_centavos,
        0
      );
      const saldo = venda.valor_total_centavos - valorPago;

      if (input.valor_centavos > saldo) {
        throw new TypeError("O pagamento não pode ser maior que o saldo da dívida.");
      }

      const pagamento: Transacao = {
        id: crypto.randomUUID(),
        data_hora: new Date().toISOString(),
        tipo: "PAGAMENTO_FIADO",
        cliente_id: venda.cliente_id,
        venda_id: venda.id,
        data_vencimento: null,
        valor_total_centavos: input.valor_centavos,
        status_pagamento: "PAGO",
        metodo_pagamento: input.metodo_pagamento,
        descricao: null,
        itens: []
      };

      await this.db.transacoes.add(pagamento);
      return pagamento;
    });
  }

  async listarContasAReceber(): Promise<ContaReceber[]> {
    const [transacoes, clientes] = await Promise.all([
      this.db.transacoes.toArray(),
      this.db.clientes.toArray()
    ]);
    const clientesPorId = new Map(clientes.map((cliente) => [cliente.id, cliente]));
    const pagamentosPorVenda = new Map<string, number>();
    const vendasCanceladas = new Set(
      transacoes
        .filter(
          (transacao) =>
            transacao.tipo === "CANCELAMENTO_VENDA" && transacao.venda_id
        )
        .map((transacao) => transacao.venda_id!)
    );

    for (const transacao of transacoes) {
      if (transacao.tipo === "PAGAMENTO_FIADO" && transacao.venda_id) {
        pagamentosPorVenda.set(
          transacao.venda_id,
          (pagamentosPorVenda.get(transacao.venda_id) ?? 0) +
            transacao.valor_total_centavos
        );
      }
    }

    return transacoes
      .filter(
        (transacao) =>
          transacao.tipo === "VENDA" &&
          !vendasCanceladas.has(transacao.id) &&
          transacao.status_pagamento !== "PAGO" &&
          Boolean(transacao.cliente_id && transacao.data_vencimento)
      )
      .flatMap((venda): ContaReceber[] => {
        const cliente = clientesPorId.get(venda.cliente_id!);
        if (!cliente) return [];

        const valorPago = pagamentosPorVenda.get(venda.id) ?? 0;
        const saldo = Math.max(0, venda.valor_total_centavos - valorPago);
        if (saldo === 0) return [];

        return [
          {
            venda,
            cliente,
            valor_pago_centavos: valorPago,
            saldo_centavos: saldo,
            status_atual: valorPago > 0 ? "PARCIAL" : "FIADO",
            dias_atraso: calcularDiasAtraso(venda.data_vencimento!)
          }
        ];
      })
      .sort(
        (a, b) =>
          b.dias_atraso - a.dias_atraso ||
          b.saldo_centavos - a.saldo_centavos ||
          a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR")
      );
  }

  async obterResumoDoDia(data = new Date()): Promise<ResumoVendas> {
    const [inicio, fim] = inicioEFimDoDia(data);
    const transacoes = await this.db.transacoes
      .where("data_hora")
      .between(inicio, fim, true, false)
      .toArray();
    const vendasCanceladas = new Set(
      (await this.db.transacoes
        .where("tipo")
        .equals("CANCELAMENTO_VENDA")
        .toArray())
        .flatMap((item) => (item.venda_id ? [item.venda_id] : []))
    );
    const vendas = transacoes.filter(
        (transacao) =>
          transacao.tipo === "VENDA" &&
          transacao.status_pagamento === "PAGO" &&
          !vendasCanceladas.has(transacao.id)
      );

    return vendas.reduce<ResumoVendas>(
      (resumo, venda) => ({
        quantidade: resumo.quantidade + 1,
        total_centavos: resumo.total_centavos + venda.valor_total_centavos
      }),
      { quantidade: 0, total_centavos: 0 }
    );
  }

  async cancelarVenda(vendaId: string, motivo?: string): Promise<Transacao> {
    return this.db.transaction(
      "rw",
      this.db.catalogo,
      this.db.transacoes,
      async () => {
        const venda = await this.db.transacoes.get(vendaId);
        if (!venda || venda.tipo !== "VENDA") {
          throw new Error("Venda não encontrada.");
        }
        const relacionados = await this.db.transacoes
          .where("venda_id")
          .equals(vendaId)
          .toArray();
        if (relacionados.some((item) => item.tipo === "CANCELAMENTO_VENDA")) {
          throw new TypeError("Esta venda já foi cancelada.");
        }
        if (relacionados.some((item) => item.tipo === "PAGAMENTO_FIADO")) {
          throw new TypeError(
            "Não é possível cancelar um fiado que já possui pagamentos."
          );
        }

        const quantidades = new Map<string, number>();
        for (const item of venda.itens) {
          if (!item.id_produto) continue;
          quantidades.set(
            item.id_produto,
            (quantidades.get(item.id_produto) ?? 0) + item.quantidade
          );
        }
        for (const [id, quantidade] of quantidades) {
          const produto = await this.db.catalogo.get(id);
          if (
            produto &&
            produto.tipo === "PRODUTO" &&
            produto.estoque_quantidade !== null
          ) {
            await this.db.catalogo.update(id, {
              estoque_quantidade: produto.estoque_quantidade + quantidade
            });
          }
        }

        const cancelamento: Transacao = {
          id: crypto.randomUUID(),
          data_hora: new Date().toISOString(),
          tipo: "CANCELAMENTO_VENDA",
          cliente_id: venda.cliente_id,
          venda_id: venda.id,
          data_vencimento: null,
          valor_total_centavos: venda.valor_total_centavos,
          status_pagamento: "CANCELADO",
          metodo_pagamento: null,
          descricao: normalizarDescricao(motivo) ?? "Venda cancelada",
          itens: []
        };
        await this.db.transacoes.add(cancelamento);
        return cancelamento;
      }
    );
  }

  async corrigirVendaFiada(
    vendaId: string,
    input: {
      itens: ItemTransacao[];
      cliente_id: string;
      data_vencimento: string;
      descricao?: string;
    }
  ): Promise<Transacao> {
    return this.db.transaction(
      "rw",
      this.db.clientes,
      this.db.catalogo,
      this.db.transacoes,
      this.db.configuracoes,
      async () => {
        await this.cancelarVenda(vendaId, "Fiado substituído por correção");
        return this.registrarVendaFiada(input);
      }
    );
  }
}
