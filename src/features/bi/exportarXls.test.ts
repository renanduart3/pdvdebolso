import { describe, expect, it } from "vitest";

import type { IndicadoresBI } from "./calculos";
import { criarXlsIndicadores } from "./exportarXls";

const indicadores: IndicadoresBI = {
  caixa: {
    hoje_centavos: 1250,
    mes_centavos: 5000,
    por_metodo: [
      { metodo: "PIX", valor_centavos: 5000, percentual: 100 },
      { metodo: "DINHEIRO", valor_centavos: 0, percentual: 0 },
      { metodo: "CARTAO", valor_centavos: 0, percentual: 0 }
    ]
  },
  horarios: {
    barras: [{ hora: 11, quantidade: 2 }],
    pico: { inicio: 11, fim: 14, quantidade: 2 }
  },
  semana: {
    dias: [{ indice: 1, nome: "SEGUNDA-FEIRA", valor_centavos: 5000, percentual: 100 }],
    melhor: { nome: "SEGUNDA-FEIRA", percentual: 100 },
    pior: { nome: "TERÇA-FEIRA", percentual: 0 }
  },
  produtos: [{
    id_produto: "produto-1",
    nome: "Café & pão",
    quantidade: 2,
    receita_centavos: 1250
  }],
  reposicao: [{
    id_produto: "produto-1",
    nome: "Café & pão",
    quantidade_7_dias: 2,
    media_diaria: 0.3,
    estoque_atual: 8
  }],
  risco: {
    divida_ativa_centavos: 500,
    vendas_mes_centavos: 5000,
    percentual: 10
  }
};

describe("exportação XLS do BI", () => {
  it("gera planilhas locais e escapa conteúdo", () => {
    const exportado = criarXlsIndicadores(
      indicadores,
      new Date("2026-07-18T12:00:00.000Z")
    );

    expect(exportado.nome_arquivo).toBe(
      "pdv-de-bolso-inteligencia-2026-07-18.xls"
    );
    expect(exportado.conteudo).toContain('ss:Name="RESUMO"');
    expect(exportado.conteudo).toContain('ss:Name="PRODUTOS"');
    expect(exportado.conteudo).toContain("Café &amp; pão");
    expect(exportado.conteudo).toContain(">12.5<");
  });
});
