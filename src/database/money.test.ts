import { describe, expect, it } from "vitest";

import {
  assertCentavos,
  calcularTotalItensCentavos,
  formatarCentavos,
  parsePrecoParaCentavos
} from "./money";

describe("money", () => {
  it("soma itens usando somente inteiros em centavos", () => {
    expect(
      calcularTotalItensCentavos([
        { quantidade: 2, preco_unitario_centavos: 1_250 },
        { quantidade: 1, preco_unitario_centavos: 499 }
      ])
    ).toBe(2_999);
  });

  it("rejeita centavos fracionários", () => {
    expect(() => assertCentavos(12.5)).toThrow(/inteiro não negativo/);
  });

  it("rejeita quantidade inválida", () => {
    expect(() =>
      calcularTotalItensCentavos([{ quantidade: 0, preco_unitario_centavos: 100 }])
    ).toThrow(/inteiro positivo/);
  });

  it("converte preço digitado sem usar ponto flutuante", () => {
    expect(parsePrecoParaCentavos("R$ 12,5")).toBe(1_250);
    expect(parsePrecoParaCentavos("9.99")).toBe(999);
    expect(formatarCentavos(1_250)).toContain("12,50");
  });
});

