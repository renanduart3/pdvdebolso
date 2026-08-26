import { criarCheckout, enviarMagicLink } from "./api";
import type { UserSession, AuthState } from "./contracts";

const TOKEN_KEY = "pdv_session_token";

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

// Extrai as infos de dentro do JWT (sem validação criptográfica - isso o Worker já faz)
function decodeJwt(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export async function getCurrentSession(): Promise<AuthState> {
  const token = getSessionToken();
  if (!token) return { sessao: null };

  const payload = decodeJwt(token);
  if (!payload || !payload.exp) {
    localStorage.removeItem(TOKEN_KEY);
    return { sessao: null };
  }

  // payload.exp está em segundos
  if (Date.now() >= payload.exp * 1000) {
    localStorage.removeItem(TOKEN_KEY);
    return { sessao: null };
  }

  return {
    sessao: {
      email: payload.email,
      plano: payload.plano,
      expira_em: new Date(payload.exp * 1000).toISOString()
    }
  };
}

export async function loginWithMagicLink(email: string): Promise<void> {
  await enviarMagicLink(email);
}

export async function createStripeCheckout(): Promise<{ url: string }> {
  const token = getSessionToken();
  if (!token) throw new Error("Você precisa estar logado.");
  return criarCheckout(token);
}

export async function logout(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}
