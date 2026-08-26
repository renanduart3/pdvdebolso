import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import type { Env } from "./index";

export const authApp = new Hono<{ Bindings: Env }>();

type TokenPayload = {
  email: string;
  exp: number;
};

export type AccountData = {
  email: string;
  plano: "GRATUITO" | "PREMIUM";
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
};

// POST /auth/login - Generates Magic Link
authApp.post("/login", async (c) => {
  const body = await c.req.json();
  const email = body.email;
  if (!email || typeof email !== "string") {
    return c.json({ error: "Email inválido" }, 400);
  }

  // Token expires in 15 minutes
  const payload: TokenPayload = {
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + 60 * 15
  };

  const token = await sign(payload, c.env.JWT_SECRET || "fallback-secret", "HS256");
  
  const magicLink = `${c.env.APP_URL || "http://localhost:5173"}/api/auth/callback?token=${token}`;
  
  // SIMULAÇÃO CONFORME PEDIDO PELO USUÁRIO (Console Temporário)
  console.log("===============================");
  console.log(`MAGIC LINK PARA ${email}:`);
  console.log(magicLink);
  console.log("===============================");

  return c.json({ message: "Magic Link gerado no console do Worker (Simulação)." });
});

// GET /auth/callback - Validates Magic Link and creates Session Token
authApp.get("/callback", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token ausente" }, 400);

  try {
    const payload = await verify(token, c.env.JWT_SECRET || "fallback-secret", "HS256") as TokenPayload;
    const email = payload.email;

    // Check if account exists, otherwise create
    let accountStr = await c.env.ACCOUNTS.get(`account:${email}`);
    let account: AccountData;

    if (!accountStr) {
      account = { email, plano: "GRATUITO" };
      await c.env.ACCOUNTS.put(`account:${email}`, JSON.stringify(account));
    } else {
      account = JSON.parse(accountStr);
    }

    // Gerar token de sessão (1 mês)
    const sessionPayload = {
      email,
      plano: account.plano,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
    };
    
    const sessionToken = await sign(sessionPayload, c.env.JWT_SECRET || "fallback-secret", "HS256");

    // Redireciona para o Front-end enviando o token na URL (ou poderia usar cookie HttpOnly)
    // Para PWAs Offline-first, salvar via query param e o front guardar no localStorage é mais maleável em PWA.
    return c.redirect(`${c.env.APP_URL || "http://localhost:5173"}/#configuracoes?session_token=${sessionToken}`);
  } catch (err) {
    return c.json({ error: "Token inválido ou expirado." }, 401);
  }
});

// Middleware para proteger rotas autenticadas (Backup e Stripe Checkout)
export const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Não autorizado" }, 401);
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = await verify(token, c.env.JWT_SECRET || "fallback-secret", "HS256");
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Sessão inválida" }, 401);
  }
};
