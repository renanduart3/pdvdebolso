import type {
  MetodoPagamento,
  ProdutoCatalogo,
  Transacao
} from "../../database/types";

const NOMES_DIAS = [
  "DOMINGO",
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
  "SÁBADO"
] as const;

type DivisaoMetodo = {
  metodo: MetodoPagamento;
  valor_centavos: number;
  percentual: number;
};

export type IndicadoresBI = {
  caixa: {
    hoje_centavos: number;
    mes_centavos: number;
    por_metodo: DivisaoMetodo[];
  };
  horarios: {
    barras: Array<{ hora: number; quantidade: number }>;
    pico: { inicio: number; fim: number; quantidade: number } | null;
  };
  semana: {
    dias: Array<{
      indice: number;
      nome: string;
      valor_centavos: number;
      percentual: number;
    }>;
    melhor: { nome: string; percentual: number } | null;
    pior: { nome: string; percentual: number } | null;
  };
  produtos: Array<{
    id_produto: string;
    nome: string;
    quantidade: number;
    receita_centavos: number;
  }>;
  reposicao: Array<{
    id_produto: string;
    nome: string;
    quantidade_7_dias: number;
    media_diaria: number;
    estoque_atual: number | null;
  }>;
  risco: {
    divida_ativa_centavos: number;
    vendas_mes_centavos: number;
    percentual: number;
  };
};

function inicioDoDia(data: Date): Date {
  const inicio = new Date(data);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

function inicioDoMes(data: Date): Date {
  const inicio = inicioDoDia(data);
  inicio.setDate(1);
  return inicio;
}

function percentual(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 10_000) / 100;
}

export function calcularIndicadoresBI(
  transacoes: Transacao[],
  catalogo: ProdutoCatalogo[],
  agora = new Date()
): IndicadoresBI {
  const inicioHoje = inicioDoDia(agora);
  const inicioMes = inicioDoMes(agora);
  const ultimos30Dias = new Date(agora);
  ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
  const ultimos7Dias = new Date(agora);
  ultimos7Dias.setDate(ultimos7Dias.getDate() - 7);

  const pagamentosPorVenda = new Map<string, number>();
  for (const transacao of transacoes) {
    if (transacao.tipo === "PAGAMENTO_FIADO" && transacao.venda_id) {
      pagamentosPorVenda.set(
        transacao.venda_id,
        (pagamentosPorVenda.get(transacao.venda_id) ?? 0) +
          transacao.valor_total_centavos
      );
    }
  }

  const vendas = transacoes.filter((transacao) => transacao.tipo === "VENDA");
  const vendasQuitadas = vendas.filter(
    (venda) =>
      venda.status_pagamento === "PAGO" ||
      (pagamentosPorVenda.get(venda.id) ?? 0) >= venda.valor_total_centavos
  );
  const recebimentos = transacoes.filter(
    (transacao) =>
      transacao.status_pagamento === "PAGO" &&
      transacao.metodo_pagamento !== null
  );

  const recebimentosHoje = recebimentos.filter(
    (transacao) => new Date(transacao.data_hora) >= inicioHoje
  );
  const recebimentosMes = recebimentos.filter(
    (transacao) => new Date(transacao.data_hora) >= inicioMes
  );
  const caixaHoje = recebimentosHoje.reduce(
    (total, transacao) => total + transacao.valor_total_centavos,
    0
  );
  const caixaMes = recebimentosMes.reduce(
    (total, transacao) => total + transacao.valor_total_centavos,
    0
  );
  const porMetodo = (["PIX", "DINHEIRO", "CARTAO"] as const).map((metodo) => {
    const valor = recebimentosMes
      .filter((transacao) => transacao.metodo_pagamento === metodo)
      .reduce((total, transacao) => total + transacao.valor_total_centavos, 0);
    return {
      metodo,
      valor_centavos: valor,
      percentual: percentual(valor, caixaMes)
    };
  });

  const horas = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    quantidade: 0
  }));
  for (const venda of vendasQuitadas) {
    const data = new Date(venda.data_hora);
    if (data >= ultimos30Dias && data <= agora) {
      horas[data.getHours()].quantidade += 1;
    }
  }
  let pico: IndicadoresBI["horarios"]["pico"] = null;
  for (let inicio = 0; inicio <= 21; inicio += 1) {
    const quantidade =
      horas[inicio].quantidade +
      horas[inicio + 1].quantidade +
      horas[inicio + 2].quantidade;
    if (quantidade > 0 && (!pico || quantidade >= pico.quantidade)) {
      pico = { inicio, fim: inicio + 3, quantidade };
    }
  }

  const semanaValores = Array.from({ length: 7 }, () => 0);
  for (const venda of vendasQuitadas) {
    const data = new Date(venda.data_hora);
    if (data >= ultimos30Dias && data <= agora) {
      semanaValores[data.getDay()] += venda.valor_total_centavos;
    }
  }
  const totalSemana = semanaValores.reduce((total, valor) => total + valor, 0);
  const dias = semanaValores.map((valor, indice) => ({
    indice,
    nome: NOMES_DIAS[indice],
    valor_centavos: valor,
    percentual: percentual(valor, totalSemana)
  }));
  const diasComVenda = dias.filter((dia) => dia.valor_centavos > 0);
  const melhor =
    diasComVenda.length > 0
      ? [...diasComVenda].sort(
          (a, b) => b.valor_centavos - a.valor_centavos
        )[0]
      : null;
  const pior =
    totalSemana > 0
      ? [...dias].sort(
          (a, b) => a.valor_centavos - b.valor_centavos
        )[0]
      : null;

  const produtosMap = new Map<
    string,
    {
      id_produto: string;
      nome: string;
      quantidade: number;
      receita_centavos: number;
    }
  >();
  for (const venda of vendasQuitadas) {
    for (const item of venda.itens) {
      const atual = produtosMap.get(item.id_produto) ?? {
        id_produto: item.id_produto,
        nome: item.nome_produto,
        quantidade: 0,
        receita_centavos: 0
      };
      atual.quantidade += item.quantidade;
      atual.receita_centavos +=
        item.quantidade * item.preco_unitario_centavos;
      produtosMap.set(item.id_produto, atual);
    }
  }
  const produtos = [...produtosMap.values()]
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        b.receita_centavos - a.receita_centavos
    )
    .slice(0, 5);

  const saidas7Dias = new Map<string, number>();
  for (const venda of vendas) {
    const data = new Date(venda.data_hora);
    if (data < ultimos7Dias || data > agora) continue;
    for (const item of venda.itens) {
      saidas7Dias.set(
        item.id_produto,
        (saidas7Dias.get(item.id_produto) ?? 0) + item.quantidade
      );
    }
  }
  const catalogoPorId = new Map(catalogo.map((item) => [item.id, item]));
  const reposicao = [...saidas7Dias.entries()]
    .flatMap(([id, quantidade]) => {
      const item = catalogoPorId.get(id);
      if (!item || item.tipo !== "PRODUTO" || quantidade <= 0) return [];
      return [
        {
          id_produto: id,
          nome: item.nome,
          quantidade_7_dias: quantidade,
          media_diaria: Math.round((quantidade / 7) * 10) / 10,
          estoque_atual: item.estoque_quantidade
        }
      ];
    })
    .sort((a, b) => b.media_diaria - a.media_diaria)
    .slice(0, 5);

  const dividaAtiva = vendas
    .filter((venda) => venda.status_pagamento !== "PAGO")
    .reduce(
      (total, venda) =>
        total +
        Math.max(
          0,
          venda.valor_total_centavos -
            (pagamentosPorVenda.get(venda.id) ?? 0)
        ),
      0
    );
  const vendasMes = vendas
    .filter((venda) => new Date(venda.data_hora) >= inicioMes)
    .reduce((total, venda) => total + venda.valor_total_centavos, 0);

  return {
    caixa: {
      hoje_centavos: caixaHoje,
      mes_centavos: caixaMes,
      por_metodo: porMetodo
    },
    horarios: { barras: horas, pico },
    semana: {
      dias,
      melhor: melhor
        ? { nome: melhor.nome, percentual: melhor.percentual }
        : null,
      pior: pior ? { nome: pior.nome, percentual: pior.percentual } : null
    },
    produtos,
    reposicao,
    risco: {
      divida_ativa_centavos: dividaAtiva,
      vendas_mes_centavos: vendasMes,
      percentual:
        vendasMes === 0 && dividaAtiva > 0
          ? 100
          : percentual(dividaAtiva, vendasMes)
    }
  };
}
