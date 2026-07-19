import {
  criarIdSessao,
  criarTokenLicenca,
  extrairSessaoDoToken
} from "./crypto";
import { criarPreferencia } from "./mercadoPago";
import type { SessaoLicenca, WorkerEnv } from "./types";
import { processarWebhook } from "./webhook";

const PENDENTE_TTL = 48 * 60 * 60;
const IDEMPOTENCIA_TTL = 10 * 60;

type Fetcher = typeof fetch;

function origensPermitidas(env: WorkerEnv): Set<string> {
  return new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((origem) => origem.trim())
      .filter(Boolean)
  );
}

function cors(request: Request, env: WorkerEnv): HeadersInit {
  const origem = request.headers.get("origin");
  if (!origem || !origensPermitidas(env).has(origem)) return {};
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(
  request: Request,
  env: WorkerEnv,
  corpo: unknown,
  status = 200
): Response {
  return Response.json(corpo, {
    status,
    headers: {
      ...cors(request, env),
      "Cache-Control": "no-store"
    }
  });
}

function erro(
  request: Request,
  env: WorkerEnv,
  codigo: string,
  mensagem: string,
  status: number
): Response {
  return json(request, env, { erro: { codigo, mensagem } }, status);
}

function origemBloqueada(request: Request, env: WorkerEnv): boolean {
  const origem = request.headers.get("origin");
  return Boolean(origem && !origensPermitidas(env).has(origem));
}

async function criarCheckout(
  request: Request,
  env: WorkerEnv,
  fetcher: Fetcher
): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return erro(
      request,
      env,
      "IDEMPOTENCIA_INVALIDA",
      "Envie uma chave de idempotência válida.",
      400
    );
  }
  const chaveIdempotencia = `checkout-idem:${idempotencyKey}`;
  const anterior = await env.LICENCAS.get(chaveIdempotencia);
  if (anterior) return json(request, env, JSON.parse(anterior));

  const sessaoId = await criarIdSessao(
    idempotencyKey,
    env.LICENSE_SIGNING_SECRET
  );
  const preferencia = await criarPreferencia(
    env,
    sessaoId,
    idempotencyKey,
    fetcher
  );
  const agora = new Date().toISOString();
  const sessao: SessaoLicenca = {
    versao: 1,
    id: sessaoId,
    status: "PENDENTE",
    preference_id: preferencia.preferenceId,
    payment_id: null,
    criado_em: agora,
    atualizado_em: agora
  };
  const resposta = {
    sessao_id: sessaoId,
    checkout_url: preferencia.checkoutUrl,
    status: sessao.status
  };
  await Promise.all([
    env.LICENCAS.put(`sessao:${sessaoId}`, JSON.stringify(sessao), {
      expirationTtl: PENDENTE_TTL
    }),
    env.LICENCAS.put(chaveIdempotencia, JSON.stringify(resposta), {
      expirationTtl: IDEMPOTENCIA_TTL
    })
  ]);
  return json(request, env, resposta, 201);
}

async function consultarSessao(
  request: Request,
  env: WorkerEnv,
  sessaoId: string
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(sessaoId)) {
    return erro(request, env, "SESSAO_INVALIDA", "Sessão inválida.", 400);
  }
  const sessao = await env.LICENCAS.get<SessaoLicenca>(
    `sessao:${sessaoId}`,
    "json"
  );
  if (!sessao) {
    return erro(
      request,
      env,
      "SESSAO_NAO_ENCONTRADA",
      "Sessão expirada ou não encontrada.",
      404
    );
  }
  if (sessao.status !== "APROVADA") {
    return json(request, env, { status: sessao.status });
  }
  return json(request, env, {
    status: "APROVADA",
    licenca: {
      versao: 1,
      token_restauracao: await criarTokenLicenca(
        sessao.id,
        env.LICENSE_SIGNING_SECRET
      ),
      ativada_em: sessao.atualizado_em,
      verificada_em: new Date().toISOString()
    }
  });
}

async function restaurarLicenca(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  let token = "";
  try {
    const body = (await request.json()) as { token_restauracao?: unknown };
    token =
      typeof body.token_restauracao === "string"
        ? body.token_restauracao.trim()
        : "";
  } catch {
    return erro(request, env, "JSON_INVALIDO", "Corpo JSON inválido.", 400);
  }
  const sessaoId = await extrairSessaoDoToken(
    token,
    env.LICENSE_SIGNING_SECRET
  );
  if (!sessaoId) {
    return erro(request, env, "LICENCA_INVALIDA", "Código de licença inválido.", 400);
  }
  const sessao = await env.LICENCAS.get<SessaoLicenca>(
    `sessao:${sessaoId}`,
    "json"
  );
  if (!sessao || sessao.status !== "APROVADA") {
    return erro(
      request,
      env,
      "LICENCA_NAO_ENCONTRADA",
      "A licença não foi encontrada ou ainda não foi aprovada.",
      404
    );
  }
  return json(request, env, {
    licenca: {
      versao: 1,
      token_restauracao: token,
      ativada_em: sessao.atualizado_em,
      verificada_em: new Date().toISOString()
    }
  });
}

async function rotearRequest(
  request: Request,
  env: WorkerEnv,
  fetcher: Fetcher = fetch
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(request, env) });
  }
  if (url.pathname === "/v1/webhooks/mercadopago" && request.method === "POST") {
    return processarWebhook(request, env, fetcher);
  }
  if (origemBloqueada(request, env)) {
    return erro(request, env, "ORIGEM_BLOQUEADA", "Origem não permitida.", 403);
  }
  if (url.pathname === "/v1/saude" && request.method === "GET") {
    return json(request, env, { ok: true });
  }
  if (url.pathname === "/v1/licencas/checkout" && request.method === "POST") {
    return criarCheckout(request, env, fetcher);
  }
  const sessaoMatch = url.pathname.match(
    /^\/v1\/licencas\/sessoes\/([0-9a-f-]{36})$/i
  );
  if (sessaoMatch && request.method === "GET") {
    return consultarSessao(request, env, sessaoMatch[1]);
  }
  if (url.pathname === "/v1/licencas/restaurar" && request.method === "POST") {
    return restaurarLicenca(request, env);
  }
  return erro(request, env, "ROTA_NAO_ENCONTRADA", "Rota não encontrada.", 404);
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  fetcher: Fetcher = fetch
): Promise<Response> {
  try {
    return await rotearRequest(request, env, fetcher);
  } catch (error) {
    console.error("Falha interna no Worker de licenças.", error);
    return erro(
      request,
      env,
      "ERRO_INTERNO",
      "Não foi possível concluir a operação agora.",
      500
    );
  }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  }
};
