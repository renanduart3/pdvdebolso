import type { LicencaLocal } from "./contracts";

const intervalosPolling = [0, 1_500, 3_000, 5_000, 8_000, 13_000];

type StatusRemoto = "PENDENTE" | "APROVADA" | "RECUSADA";

export interface CheckoutLicenca {
  sessao_id: string;
  checkout_url: string;
  status: "PENDENTE";
}

export type ConsultaLicenca =
  | { status: "PENDENTE" | "RECUSADA" }
  | { status: "APROVADA"; licenca: LicencaLocal };

interface ErroApi {
  erro?: {
    mensagem?: string;
  };
}

function baseUrl(): string {
  return (import.meta.env.VITE_PAYMENT_WORKER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
}

export function pagamentoConfigurado(): boolean {
  return baseUrl().length > 0;
}

async function requisicao<T>(
  caminho: string,
  init?: RequestInit
): Promise<T> {
  const base = baseUrl();
  if (!base) {
    throw new Error("O serviço de pagamento ainda não foi configurado.");
  }
  const resposta = await fetch(`${base}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  if (!resposta.ok) {
    let mensagem = "O serviço de pagamento não respondeu como esperado.";
    try {
      const corpo = await resposta.json() as ErroApi;
      mensagem = corpo.erro?.mensagem ?? mensagem;
    } catch {
      // Mantém uma mensagem segura sem expor a resposta do provedor.
    }
    throw new Error(mensagem);
  }
  return resposta.json() as Promise<T>;
}

export function criarCheckoutLicenca(
  idempotencyKey: string
): Promise<CheckoutLicenca> {
  return requisicao<CheckoutLicenca>("/v1/licencas/checkout", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey
    }
  });
}

export function consultarSessaoLicenca(
  sessaoId: string,
  signal?: AbortSignal
): Promise<ConsultaLicenca> {
  return requisicao<ConsultaLicenca>(
    `/v1/licencas/sessoes/${encodeURIComponent(sessaoId)}`,
    { signal }
  );
}

export async function aguardarConfirmacaoLicenca(
  sessaoId: string,
  signal?: AbortSignal
): Promise<ConsultaLicenca> {
  let ultima: ConsultaLicenca = { status: "PENDENTE" };
  for (const intervalo of intervalosPolling) {
    if (intervalo > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, intervalo);
        signal?.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            reject(new DOMException("Operação cancelada.", "AbortError"));
          },
          { once: true }
        );
      });
    }
    if (signal?.aborted) {
      throw new DOMException("Operação cancelada.", "AbortError");
    }
    ultima = await consultarSessaoLicenca(sessaoId, signal);
    if (ultima.status !== "PENDENTE") return ultima;
  }
  return ultima;
}

export async function restaurarLicenca(
  tokenRestauracao: string
): Promise<LicencaLocal> {
  const resposta = await requisicao<{ licenca: LicencaLocal }>(
    "/v1/licencas/restaurar",
    {
      method: "POST",
      body: JSON.stringify({
        token_restauracao: tokenRestauracao.trim()
      })
    }
  );
  return resposta.licenca;
}

export function ehStatusRemoto(valor: unknown): valor is StatusRemoto {
  return valor === "PENDENTE" || valor === "APROVADA" || valor === "RECUSADA";
}
