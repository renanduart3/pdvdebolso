import { assinarHmacHex, comparacaoConstante } from "./crypto";
import { obterPagamento, pagamentoConfere } from "./mercadoPago";
import type { SessaoLicenca, WorkerEnv } from "./types";

const JANELA_ASSINATURA_SEGUNDOS = 10 * 60;

interface Notificacao {
  id?: string | number;
  type?: string;
  action?: string;
  data?: {
    id?: string | number;
  };
}

function partesAssinatura(header: string): { ts: string; v1: string } | null {
  const partes = Object.fromEntries(
    header.split(",").map((parte) => {
      const [chave, ...valor] = parte.trim().split("=");
      return [chave, valor.join("=")];
    })
  );
  return partes.ts && partes.v1 ? { ts: partes.ts, v1: partes.v1 } : null;
}

export async function assinaturaWebhookValida(
  request: Request,
  dataId: string,
  segredo: string,
  agoraSegundos = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const assinatura = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!assinatura || !requestId) return false;
  const partes = partesAssinatura(assinatura);
  if (!partes || !/^\d+$/.test(partes.ts)) return false;
  const timestamp = Number(partes.ts);
  if (Math.abs(agoraSegundos - timestamp) > JANELA_ASSINATURA_SEGUNDOS) {
    return false;
  }
  const manifesto =
    `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
  const esperada = await assinarHmacHex(manifesto, segredo);
  return comparacaoConstante(esperada, partes.v1.toLowerCase());
}

export async function processarWebhook(
  request: Request,
  env: WorkerEnv,
  fetcher: typeof fetch
): Promise<Response> {
  let notificacao: Notificacao;
  try {
    notificacao = (await request.json()) as Notificacao;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (notificacao.type !== "payment") {
    return new Response(null, { status: 200 });
  }
  const url = new URL(request.url);
  const dataId = String(
    url.searchParams.get("data.id") ??
    url.searchParams.get("data_id") ??
    notificacao.data?.id ??
    ""
  );
  if (!dataId) return new Response(null, { status: 400 });
  if (
    !(await assinaturaWebhookValida(
      request,
      dataId,
      env.MP_WEBHOOK_SECRET
    ))
  ) {
    return new Response(null, { status: 401 });
  }

  const eventoId = String(notificacao.id ?? `${dataId}:${notificacao.action}`);
  if (await env.LICENCAS.get(`webhook:${eventoId}`)) {
    return new Response(null, { status: 200 });
  }

  const pagamento = await obterPagamento(env, dataId, fetcher);
  const referencia = pagamento.external_reference ?? "";
  if (!referencia.startsWith("licenca:")) {
    await env.LICENCAS.put(`webhook:${eventoId}`, "IGNORADO", {
      expirationTtl: 90 * 24 * 60 * 60
    });
    return new Response(null, { status: 200 });
  }

  const sessaoId = referencia.slice("licenca:".length);
  const sessao = await env.LICENCAS.get<SessaoLicenca>(
    `sessao:${sessaoId}`,
    "json"
  );
  if (!sessao) return new Response(null, { status: 200 });

  const agora = new Date().toISOString();
  const aprovada = pagamentoConfere(pagamento, sessaoId, env);
  const atualizada: SessaoLicenca = {
    ...sessao,
    status: aprovada
      ? "APROVADA"
      : pagamento.status === "rejected" || pagamento.status === "cancelled"
        ? "RECUSADA"
        : "PENDENTE",
    payment_id: String(pagamento.id),
    atualizado_em: agora
  };
  await env.LICENCAS.put(`sessao:${sessaoId}`, JSON.stringify(atualizada));
  await env.LICENCAS.put(`webhook:${eventoId}`, "PROCESSADO", {
    expirationTtl: 90 * 24 * 60 * 60
  });
  return new Response(null, { status: 200 });
}
