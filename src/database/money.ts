import type { ItemTransacao } from "./types";

export function assertCentavos(value: number, fieldName = "valor"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} deve ser um inteiro não negativo em centavos.`);
  }
}

export function calcularTotalItensCentavos(
  itens: ReadonlyArray<Pick<ItemTransacao, "quantidade" | "preco_unitario_centavos">>
): number {
  return itens.reduce((total, item, index) => {
    if (!Number.isSafeInteger(item.quantidade) || item.quantidade <= 0) {
      throw new TypeError(`itens[${index}].quantidade deve ser um inteiro positivo.`);
    }

    assertCentavos(
      item.preco_unitario_centavos,
      `itens[${index}].preco_unitario_centavos`
    );

    const subtotal = item.quantidade * item.preco_unitario_centavos;

    if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total + subtotal)) {
      throw new RangeError("O total da venda ultrapassa o limite monetário seguro.");
    }

    return total + subtotal;
  }, 0);
}

export function formatarCentavos(
  value: number,
  currency = "BRL",
  locale = "pt-BR"
): string {
  assertCentavos(value);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency
    })
      .format(value / 100)
      .replace(/\u00a0/g, " ");
  } catch {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    })
      .format(value / 100)
      .replace(/\u00a0/g, " ");
  }
}

export function parsePrecoParaCentavos(input: string): number {
  const normalized = input.trim().replace(/^[R$\s$€A-Za-z\u00a0]+/i, "").trim();
  const match = normalized.match(/^(\d+)(?:[,.](\d{1,2}))?$/);

  if (!match) {
    throw new TypeError("Informe um preço válido, como 12,50.");
  }

  const reais = Number(match[1]);
  const centavos = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const total = reais * 100 + centavos;

  assertCentavos(total, "preço");
  return total;
}
