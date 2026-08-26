import { Hono } from "hono";
import type { Env } from "./index";
import { authMiddleware, type AccountData } from "./auth";

export const backupApp = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// POST /backup - Salva o JSON no R2
backupApp.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const email = user.email;

  // Valida se usuário é premium
  const accountStr = await c.env.ACCOUNTS.get(`account:${email}`);
  if (!accountStr) return c.json({ error: "Conta não encontrada." }, 404);
  
  const account: AccountData = JSON.parse(accountStr);
  if (account.plano !== "PREMIUM") {
    return c.json({ error: "O Cofre em Nuvem é um recurso Premium." }, 403);
  }

  const body = await c.req.text(); // O backup é um Blob de JSON

  // Salva no R2, esmagando o arquivo anterior
  const key = `backup_${email}.json`;
  await c.env.BACKUPS.put(key, body);

  return c.json({ message: "Cofre atualizado com sucesso." });
});

// GET /backup - Recupera o JSON do R2
backupApp.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const email = user.email;

  const key = `backup_${email}.json`;
  const object = await c.env.BACKUPS.get(key);

  if (!object) {
    return c.json({ error: "Nenhum cofre encontrado na nuvem." }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers as any);
  headers.set("etag", object.httpEtag);
  headers.set("Content-Type", "application/json");

  return new Response(object.body, { headers });
});
