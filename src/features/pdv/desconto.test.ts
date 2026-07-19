import { describe, expect, it } from "vitest";

import { calcularTotalItensCentavos } from "../../database/money";
import type { ItemTransacao } from "../../database/types";
import {
  aplicarDescontoAosItens,
  calcularDescontoPercentualCentavos,
  parsePercentualParaBasisPoints
} from "./desconto";

const itens: ItemTransacao[] = [
  {
    id_produto: "cafe",
    nome_produto: "Café",
    quantidade: 3,
    preco_unitario_centavos: 500
  },
  {
    id_produto: "bolo",
    nome_produto: "Bolo",
    quantidade: 2,
    preco_unitario_centavos: 750
  }
];

describe("aplicarDescontoAosItens", () => {
  it("distribui desconto exato preservando produto e quantidade", () => {
    const resultado = aplicarDescontoAosItens(itens, 101);

    expect(calcularTotalItensCentavos(resultado)).toBe(2899);
    expect(
      resultado.reduce((total, item) => total + item.quantidade, 0)
    ).toBe(5);
    expect(new Set(resultado.map((item) => item.id_produto))).toEqual(
      new Set(["cafe", "bolo"])
    );
  });

  it("aceita venda integralmente descontada sem preço negativo", () => {
    const resultado = aplicarDescontoAosItens(itens, 3000);

    expect(calcularTotalItensCentavos(resultado)).toBe(0);
    expect(resultado.every((item) => item.preco_unitario_centavos === 0)).toBe(true);
  });

  it("recusa desconto maior que o subtotal", () => {
    expect(() => aplicarDescontoAosItens(itens, 3001)).toThrow(
      "maior que o subtotal"
    );
  });

  it("converte percentual sem ponto flutuante e arredonda centavos", () => {
    expect(parsePercentualParaBasisPoints("7,5%")).toBe(750);
    expect(calcularDescontoPercentualCentavos(1999, 750)).toBe(150);
    expect(() => parsePercentualParaBasisPoints("100,01")).toThrow(
      "entre 0% e 100%"
    );
  });
});
