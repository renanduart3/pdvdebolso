import { describe, expect, it, vi } from "vitest";

import { assinarHmacHex, criarIdSessao } from "./crypto";
import { handleRequest } from "./index";
import type { KvNamespace, KvPutOptions, WorkerEnv } from "./types";

class MemoryKv implements KvNamespace {
  readonly values = new Map<string, string>();
  readonly options = new Map<string, KvPutOptions | undefined>();

  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  get(key: string): Promise<string | null>;
  async get<T = unknown>(
    key: string,
    type?: "json"
  ): Promise<T | string | null> {
    const valor = this.values.get(key);
    if (valor === undefined) return null;
    return type === "json" ? JSON.parse(valor) as T : valor;
  }

  async put(
    key: string,
    value: string,
    options?: KvPutOptions
  ): Promise<void> {
    this.values.set(key, value);
    this.options.set(key, options);
  }
}

function criarEnv(): WorkerEnv {
  return {
    LICENCAS: new MemoryKv(),
    APP_ORIGIN: "https://pdvdebolso.com",
    ALLOWED_ORIGINS:
      "https://pdvdebolso.com,http://localhost:5173",
    LICENSE_PRICE_BRL: "5.00",
    MP_ACCESS_TOKEN: "TEST-access-token",
    MP_WEBHOOK_SECRET: "webhook-secret-for-tests",
    LICENSE_SIGNING_SECRET: "license-signing-secret-with-more-than-32-bytes"
  };
}

function requestCheckout(idempotencia = "1234567890abcdef"): Request {
  return new Request("https://worker.test/v1/licencas/checkout", {
    method: "POST",
    headers: {
      Origin: "https://pdvdebolso.com",
      "Idempotency-Key": idempotencia
    }
  });
}

describe("Worker de pagamento e licença", () => {
  it("deriva a mesma sessão para a mesma chave de idempotência", async () => {
    const segredo = "license-signing-secret-with-more-than-32-bytes";
    const primeira = await criarIdSessao("chave-idempotente-123", segredo);
    const segunda = await criarIdSessao("chave-idempotente-123", segredo);
    const diferente = await criarIdSessao("chave-idempotente-456", segredo);

    expect(primeira).toBe(segunda);
    expect(primeira).not.toBe(diferente);
    expect(primeira).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("restringe CORS e responde o healthcheck sem dados comerciais", async () => {
    const env = criarEnv();
    const bloqueada = await handleRequest(
      new Request("https://worker.test/v1/saude", {
        headers: { Origin: "https://site-invasor.example" }
      }),
      env
    );
    expect(bloqueada.status).toBe(403);

    const permitida = await handleRequest(
      new Request("https://worker.test/v1/saude", {
        headers: { Origin: "https://pdvdebolso.com" }
      }),
      env
    );
    expect(permitida.status).toBe(200);
    expect(permitida.headers.get("access-control-allow-origin")).toBe(
      "https://pdvdebolso.com"
    );
    expect(await permitida.json()).toEqual({ ok: true });
  });

  it("cria uma preferência de preço fixo e reaproveita a idempotência", async () => {
    const env = criarEnv();
    let corpoMercadoPago: Record<string, unknown> | null = null;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      corpoMercadoPago = JSON.parse(String(init?.body));
      return Response.json({
        id: "preferencia-123",
        init_point: "https://mercadopago.test/checkout/123"
      });
    }) as unknown as typeof fetch;

    const primeira = await handleRequest(requestCheckout(), env, fetcher);
    const segunda = await handleRequest(requestCheckout(), env, fetcher);
    const primeiraJson = await primeira.json() as Record<string, unknown>;
    const segundaJson = await segunda.json() as Record<string, unknown>;

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segundaJson).toEqual(primeiraJson);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(corpoMercadoPago).toMatchObject({
      items: [
        {
          id: "licenca-sem-anuncios",
          currency_id: "BRL",
          quantity: 1,
          unit_price: 5
        }
      ]
    });
    expect(JSON.stringify(corpoMercadoPago)).not.toMatch(
      /cliente|catalogo|transa|faturamento/i
    );
  });

  it("recusa webhook inválido antes de consultar o pagamento", async () => {
    const env = criarEnv();
    const fetcher = vi.fn() as unknown as typeof fetch;
    const resposta = await handleRequest(
      new Request(
        "https://worker.test/v1/webhooks/mercadopago?data.id=9001",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "request-1",
            "x-signature": "ts=1,v1=invalida"
          },
          body: JSON.stringify({
            id: "evento-1",
            type: "payment",
            data: { id: "9001" }
          })
        }
      ),
      env,
      fetcher
    );
    expect(resposta.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("confirma o pagamento na API, emite e restaura a licença", async () => {
    const env = criarEnv();
    let sessaoId = "";
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const endereco = String(url);
      if (endereco.includes("/checkout/preferences")) {
        return Response.json({
          id: "preferencia-aprovada",
          init_point: "https://mercadopago.test/checkout/aprovado"
        });
      }
      return Response.json({
        id: 9001,
        status: "approved",
        external_reference: `licenca:${sessaoId}`,
        transaction_amount: 5,
        currency_id: "BRL",
        metadata: { license_session_id: sessaoId }
      });
    }) as unknown as typeof fetch;

    const checkout = await handleRequest(requestCheckout("checkout-aprovado-123"), env, fetcher);
    const checkoutJson = await checkout.json() as { sessao_id: string };
    sessaoId = checkoutJson.sessao_id;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestId = "request-aprovado";
    const manifesto =
      `id:9001;request-id:${requestId};ts:${timestamp};`;
    const assinatura = await assinarHmacHex(
      manifesto,
      env.MP_WEBHOOK_SECRET
    );
    const webhook = await handleRequest(
      new Request(
        "https://worker.test/v1/webhooks/mercadopago?data.id=9001",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
            "x-signature": `ts=${timestamp},v1=${assinatura}`
          },
          body: JSON.stringify({
            id: "evento-aprovado",
            type: "payment",
            action: "payment.updated",
            data: { id: "9001" }
          })
        }
      ),
      env,
      fetcher
    );
    expect(webhook.status).toBe(200);

    const consulta = await handleRequest(
      new Request(
        `https://worker.test/v1/licencas/sessoes/${sessaoId}`,
        { headers: { Origin: "https://pdvdebolso.com" } }
      ),
      env
    );
    const consultaJson = await consulta.json() as {
      status: string;
      licenca: { token_restauracao: string };
    };
    expect(consultaJson.status).toBe("APROVADA");
    expect(consultaJson.licenca.token_restauracao).toMatch(/^pdvb1\./);

    const restauracao = await handleRequest(
      new Request("https://worker.test/v1/licencas/restaurar", {
        method: "POST",
        headers: {
          Origin: "https://pdvdebolso.com",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token_restauracao: consultaJson.licenca.token_restauracao
        })
      }),
      env
    );
    expect(restauracao.status).toBe(200);
    expect(await restauracao.json()).toMatchObject({
      licenca: {
        versao: 1,
        token_restauracao: consultaJson.licenca.token_restauracao
      }
    });
  });
});
