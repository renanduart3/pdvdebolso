import { afterEach, describe, expect, it, vi } from "vitest";

import {
  criarCheckoutLicenca,
  pagamentoConfigurado,
  restaurarLicenca
} from "./api";

describe("API client-side de licença", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("permanece indisponível quando o Worker não foi configurado", async () => {
    vi.stubEnv("VITE_PAYMENT_WORKER_URL", "");
    expect(pagamentoConfigurado()).toBe(false);
    await expect(criarCheckoutLicenca("1234567890abcdef")).rejects.toThrow(
      "ainda não foi configurado"
    );
  });

  it("cria checkout sem enviar dados comerciais", async () => {
    vi.stubEnv("VITE_PAYMENT_WORKER_URL", "https://pagamentos.example/");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.body).toBeUndefined();
      return Response.json({
        sessao_id: "sessao-1234567890",
        checkout_url: "https://mercadopago.test/checkout",
        status: "PENDENTE"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await criarCheckoutLicenca("1234567890abcdef")).toMatchObject({
      status: "PENDENTE"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pagamentos.example/v1/licencas/checkout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "1234567890abcdef"
        })
      })
    );
  });

  it("restaura licença usando somente o código informado", async () => {
    vi.stubEnv("VITE_PAYMENT_WORKER_URL", "https://pagamentos.example");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        licenca: {
          versao: 1,
          token_restauracao: JSON.parse(String(init?.body)).token_restauracao,
          ativada_em: "2026-07-18T12:00:00.000Z",
          verificada_em: "2026-07-18T12:01:00.000Z"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await restaurarLicenca(" codigo-restauracao-123456 ")).toMatchObject({
      token_restauracao: "codigo-restauracao-123456"
    });
  });
});
