import { describe, expect, it } from "vitest";

import { criarLinkCobrancaWhatsApp } from "./whatsapp";

describe("criarLinkCobrancaWhatsApp", () => {
  it("monta uma cobrança com saldo e chave PIX", () => {
    const link = criarLinkCobrancaWhatsApp({
      telefone: "55 (11) 99999-9999",
      nomeCliente: "Maria",
      saldoCentavos: 1250,
      chavePix: "maria@example.com"
    });
    const url = new URL(link);
    const mensagem = url.searchParams.get("text");

    expect(url.origin + url.pathname).toBe("https://wa.me/5511999999999");
    expect(mensagem).toContain("Maria");
    expect(mensagem).toMatch(/R\$\s12,50/);
    expect(mensagem).toContain("maria@example.com");
  });
});
