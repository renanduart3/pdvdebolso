import { describe, expect, it } from "vitest";

import { filtrarDecimal, filtrarInteiro } from "./numericInput";

describe("filtros de entrada numérica", () => {
  it("remove letras e limita casas decimais", () => {
    expect(filtrarDecimal("R$ 12a,345")).toBe("12,34");
    expect(filtrarDecimal("7.5%")).toBe("7,5");
  });

  it("aceita somente inteiro e sinal quando permitido", () => {
    expect(filtrarInteiro("12e3")).toBe("123");
    expect(filtrarInteiro("-4 itens", true)).toBe("-4");
    expect(filtrarInteiro("-4 itens")).toBe("4");
  });
});
