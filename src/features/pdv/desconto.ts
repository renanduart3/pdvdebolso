import { calcularTotalItensCentavos } from "../../database/money";
import type { ItemTransacao } from "../../database/types";

export function parsePercentualParaBasisPoints(input: string): number {
  const normalizado = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) {
    throw new TypeError("Informe um percentual válido, como 10 ou 7,5.");
  }
  const [inteiro, decimal = ""] = normalizado.split(".");
  const basisPoints =
    Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new TypeError("O desconto deve ficar entre 0% e 100%.");
  }
  return basisPoints;
}

export function calcularDescontoPercentualCentavos(
  totalCentavos: number,
  basisPoints: number
): number {
  if (
    !Number.isSafeInteger(totalCentavos) ||
    totalCentavos < 0 ||
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    throw new TypeError("Não foi possível calcular o desconto percentual.");
  }
  return Number(
    (BigInt(totalCentavos) * BigInt(basisPoints) + 5_000n) / 10_000n
  );
}

export function aplicarDescontoAosItens(
  itens: ItemTransacao[],
  descontoCentavos: number
): ItemTransacao[] {
  const totalBruto = calcularTotalItensCentavos(itens);

  if (!Number.isSafeInteger(descontoCentavos) || descontoCentavos < 0) {
    throw new TypeError("O desconto deve ser um valor válido em centavos.");
  }
  if (descontoCentavos > totalBruto) {
    throw new TypeError("O desconto não pode ser maior que o subtotal.");
  }
  if (descontoCentavos === 0) return itens.map((item) => ({ ...item }));

  let brutoAcumulado = 0;
  let descontoAcumulado = 0;
  const itensComDesconto: ItemTransacao[] = [];

  for (const item of itens) {
    brutoAcumulado += item.quantidade * item.preco_unitario_centavos;
    const descontoAteAqui = Math.floor(
      (descontoCentavos * brutoAcumulado) / totalBruto
    );
    const descontoDaLinha = descontoAteAqui - descontoAcumulado;
    descontoAcumulado = descontoAteAqui;

    const descontoPorUnidade = Math.floor(
      descontoDaLinha / item.quantidade
    );
    const unidadesComCentavoExtra = descontoDaLinha % item.quantidade;
    const precoBase = item.preco_unitario_centavos - descontoPorUnidade;

    if (unidadesComCentavoExtra > 0) {
      itensComDesconto.push({
        ...item,
        quantidade: unidadesComCentavoExtra,
        preco_unitario_centavos: precoBase - 1
      });
    }

    const unidadesRestantes = item.quantidade - unidadesComCentavoExtra;
    if (unidadesRestantes > 0) {
      itensComDesconto.push({
        ...item,
        quantidade: unidadesRestantes,
        preco_unitario_centavos: precoBase
      });
    }
  }

  return itensComDesconto;
}
