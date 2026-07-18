import { describe, expect, it } from "vitest";

import type { ProdutoCatalogo, Transacao } from "../../database/types";
import { calcularIndicadoresBI } from "./calculos";

const catalogo: ProdutoCatalogo[] = [
  {
    id: "produto-1",
    nome: "Brownie",
    preco_padrao_centavos: 500,
    tipo: "PRODUTO",
    estoque_quantidade: 10,
    ativo: true
  }
];

function venda(input: {
  id: string;
  data: Date;
  quantidade: number;
  status: "PAGO" | "FIADO";
  metodo?: "PIX" | "DINHEIRO" | "CARTAO";
}): Transacao {
  return {
    id: input.id,
    data_hora: input.data.toISOString(),
    tipo: "VENDA",
    cliente_id: input.status === "FIADO" ? "cliente-1" : null,
    venda_id: null,
    data_vencimento: input.status === "FIADO" ? "2026-07-20" : null,
    valor_total_centavos: input.quantidade * 500,
    status_pagamento: input.status,
    metodo_pagamento: input.status === "PAGO" ? input.metodo ?? "PIX" : null,
    itens: [
      {
        id_produto: "produto-1",
        nome_produto: "Brownie",
        quantidade: input.quantidade,
        preco_unitario_centavos: 500
      }
    ]
  };
}

function pagamento(input: {
  id: string;
  vendaId: string;
  data: Date;
  valor: number;
}): Transacao {
  return {
    id: input.id,
    data_hora: input.data.toISOString(),
    tipo: "PAGAMENTO_FIADO",
    cliente_id: "cliente-1",
    venda_id: input.vendaId,
    data_vencimento: null,
    valor_total_centavos: input.valor,
    status_pagamento: "PAGO",
    metodo_pagamento: "DINHEIRO",
    itens: []
  };
}

describe("calcularIndicadoresBI", () => {
  it("separa caixa, vendas quitadas, burn rate e risco", () => {
    const agora = new Date(2026, 6, 18, 18, 0, 0);
    const transacoes = [
      venda({
        id: "venda-paga",
        data: new Date(2026, 6, 18, 11, 0, 0),
        quantidade: 2,
        status: "PAGO",
        metodo: "PIX"
      }),
      venda({
        id: "venda-fiada",
        data: new Date(2026, 6, 18, 12, 0, 0),
        quantidade: 4,
        status: "FIADO"
      }),
      pagamento({
        id: "pagamento-parcial",
        vendaId: "venda-fiada",
        data: new Date(2026, 6, 18, 14, 0, 0),
        valor: 500
      })
    ];

    const indicadores = calcularIndicadoresBI(transacoes, catalogo, agora);

    expect(indicadores.caixa.hoje_centavos).toBe(1500);
    expect(indicadores.caixa.mes_centavos).toBe(1500);
    expect(indicadores.caixa.por_metodo).toEqual([
      expect.objectContaining({ metodo: "PIX", percentual: 66.67 }),
      expect.objectContaining({ metodo: "DINHEIRO", percentual: 33.33 }),
      expect.objectContaining({ metodo: "CARTAO", percentual: 0 })
    ]);
    expect(indicadores.produtos[0]).toMatchObject({
      nome: "Brownie",
      quantidade: 2,
      receita_centavos: 1000
    });
    expect(indicadores.reposicao[0]).toMatchObject({
      quantidade_7_dias: 6,
      media_diaria: 0.9
    });
    expect(indicadores.risco).toEqual({
      divida_ativa_centavos: 1500,
      vendas_mes_centavos: 3000,
      percentual: 50
    });
    expect(indicadores.horarios.barras[11].quantidade).toBe(1);
    expect(indicadores.horarios.barras[12].quantidade).toBe(0);
  });

  it("passa a considerar uma venda fiada quando ela fica totalmente quitada", () => {
    const agora = new Date(2026, 6, 18, 18, 0, 0);
    const fiado = venda({
      id: "venda-fiada",
      data: new Date(2026, 6, 17, 12, 0, 0),
      quantidade: 4,
      status: "FIADO"
    });
    const indicadores = calcularIndicadoresBI(
      [
        fiado,
        pagamento({
          id: "pagamento-total",
          vendaId: fiado.id,
          data: new Date(2026, 6, 18, 10, 0, 0),
          valor: 2000
        })
      ],
      catalogo,
      agora
    );

    expect(indicadores.produtos[0].quantidade).toBe(4);
    expect(indicadores.semana.melhor?.percentual).toBe(100);
    expect(indicadores.risco.divida_ativa_centavos).toBe(0);
  });
});
