import { formatarCentavos } from "../../database/money";

export function criarLinkCobrancaWhatsApp(input: {
  telefone: string;
  nomeCliente: string;
  saldoCentavos: number;
  chavePix?: string;
}): string {
  const telefone = input.telefone.replace(/\D/g, "");

  if (!telefone) {
    throw new TypeError("O cliente não possui telefone para cobrança.");
  }

  const linhas = [
    `Olá, ${input.nomeCliente}! Tudo bem?`,
    `Passando para lembrar que ficou pendente o valor de ${formatarCentavos(input.saldoCentavos)}.`
  ];

  if (input.chavePix?.trim()) {
    linhas.push(`Se preferir pagar por PIX, a chave é: ${input.chavePix.trim()}`);
  }

  linhas.push("Obrigado!");

  return `https://wa.me/${telefone}?text=${encodeURIComponent(linhas.join("\n\n"))}`;
}

