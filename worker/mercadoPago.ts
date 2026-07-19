import type { MercadoPagoPayment, WorkerEnv } from "./types";

const API_MERCADO_PAGO = "https://api.mercadopago.com";

interface PreferenciaResposta {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

function precoLicenca(env: WorkerEnv): number {
  const valor = Number(env.LICENSE_PRICE_BRL);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("LICENSE_PRICE_BRL inválido.");
  }
  return Math.round(valor * 100) / 100;
}

async function respostaMercadoPago<T>(resposta: Response): Promise<T> {
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    console.error("Mercado Pago respondeu com erro.", resposta.status, detalhe);
    throw new Error("Não foi possível concluir a operação no Mercado Pago.");
  }
  return resposta.json() as Promise<T>;
}

export async function criarPreferencia(
  env: WorkerEnv,
  sessaoId: string,
  idempotencyKey: string,
  fetcher: typeof fetch
): Promise<{ preferenceId: string; checkoutUrl: string }> {
  const retorno = `${env.APP_ORIGIN.replace(/\/$/, "")}/?pagamento=`;
  const resposta = await fetcher(`${API_MERCADO_PAGO}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      items: [
        {
          id: "licenca-sem-anuncios",
          title: "PDV de Bolso — remover anúncios",
          description: "Licença permanente para usar o PDV de Bolso sem anúncios.",
          currency_id: "BRL",
          quantity: 1,
          unit_price: precoLicenca(env)
        }
      ],
      external_reference: `licenca:${sessaoId}`,
      metadata: {
        license_session_id: sessaoId
      },
      back_urls: {
        success: `${retorno}sucesso`,
        pending: `${retorno}pendente`,
        failure: `${retorno}falha`
      },
      auto_return: "approved",
      statement_descriptor: "PDV DE BOLSO"
    })
  });
  const preferencia = await respostaMercadoPago<PreferenciaResposta>(resposta);
  const checkoutUrl = env.MP_ACCESS_TOKEN.startsWith("TEST-")
    ? preferencia.sandbox_init_point ?? preferencia.init_point
    : preferencia.init_point ?? preferencia.sandbox_init_point;
  if (!preferencia.id || !checkoutUrl) {
    throw new Error("O Mercado Pago não devolveu uma preferência válida.");
  }
  return {
    preferenceId: preferencia.id,
    checkoutUrl
  };
}

export async function obterPagamento(
  env: WorkerEnv,
  paymentId: string,
  fetcher: typeof fetch
): Promise<MercadoPagoPayment> {
  const resposta = await fetcher(
    `${API_MERCADO_PAGO}/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`
      }
    }
  );
  return respostaMercadoPago<MercadoPagoPayment>(resposta);
}

export function pagamentoConfere(
  pagamento: MercadoPagoPayment,
  sessaoId: string,
  env: WorkerEnv
): boolean {
  const referenciaEsperada = `licenca:${sessaoId}`;
  const valorEsperado = precoLicenca(env);
  return (
    pagamento.status === "approved" &&
    pagamento.external_reference === referenciaEsperada &&
    Math.abs((pagamento.transaction_amount ?? 0) - valorEsperado) < 0.001 &&
    pagamento.currency_id === "BRL" &&
    (
      pagamento.metadata?.license_session_id === undefined ||
      pagamento.metadata.license_session_id === sessaoId
    )
  );
}
