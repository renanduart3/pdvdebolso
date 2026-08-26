import type { UserSession } from "./contracts";

export interface ErroApi {
  error?: string;
  message?: string;
}

export function baseUrl(): string {
  // Para desenvolvimento local
  return (import.meta.env.VITE_API_URL ?? "http://localhost:8787")
    .trim()
    .replace(/\/$/, "");
}

export async function requisicao<T>(
  caminho: string,
  init?: RequestInit,
  tokenOpcional?: string
): Promise<T> {
  const base = baseUrl();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (tokenOpcional) {
    headers.set("Authorization", `Bearer ${tokenOpcional}`);
  }

  const resposta = await fetch(`${base}${caminho}`, {
    ...init,
    headers
  });

  if (!resposta.ok) {
    let mensagem = "A comunicação com o servidor falhou.";
    try {
      const corpo = await resposta.json() as ErroApi;
      mensagem = corpo.error ?? corpo.message ?? mensagem;
    } catch {
      // Ignora e usa a genérica
    }
    throw new Error(mensagem);
  }
  return resposta.json() as Promise<T>;
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================
export function enviarMagicLink(email: string): Promise<{ message: string }> {
  return requisicao("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

// O GET /auth/callback é feito diretamente pelo navegador que recebe redirecionamento

// ==========================================
// STRIPE
// ==========================================
export function criarCheckout(sessionToken: string): Promise<{ url: string }> {
  return requisicao<{ url: string }>("/stripe/checkout", {
    method: "POST"
  }, sessionToken);
}

// ==========================================
// COFRE EM NUVEM (BACKUP R2)
// ==========================================
export async function salvarCofreNuvem(sessionToken: string, json: string): Promise<{ message: string }> {
  const base = baseUrl();
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${sessionToken}`);
  // R2 espera body cru
  headers.set("Content-Type", "text/plain");

  const resposta = await fetch(`${base}/backup`, {
    method: "POST",
    headers,
    body: json
  });

  if (!resposta.ok) {
    let mensagem = "Não foi possível salvar na nuvem.";
    try {
      const corpo = await resposta.json() as ErroApi;
      mensagem = corpo.error ?? corpo.message ?? mensagem;
    } catch {}
    throw new Error(mensagem);
  }
  return resposta.json();
}

export async function baixarCofreNuvem(sessionToken: string): Promise<string> {
  const base = baseUrl();
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${sessionToken}`);
  
  const resposta = await fetch(`${base}/backup`, {
    method: "GET",
    headers
  });

  if (!resposta.ok) {
    let mensagem = "Não foi possível resgatar o backup da nuvem.";
    try {
      const corpo = await resposta.json() as ErroApi;
      mensagem = corpo.error ?? corpo.message ?? mensagem;
    } catch {}
    throw new Error(mensagem);
  }

  return resposta.text();
}
