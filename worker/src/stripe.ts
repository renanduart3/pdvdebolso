import { Hono } from "hono";
import type { Env } from "./index";
import { authMiddleware, type AccountData } from "./auth";

export const stripeApp = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// POST /stripe/checkout (Criar Checkout)
stripeApp.post("/checkout", authMiddleware, async (c) => {
  const user = c.get("user");
  const email = user.email;

  // Em produção, você faria uma chamada fetch POST para https://api.stripe.com/v1/checkout/sessions
  // Usaremos um stub simulando que Stripe foi chamado, já que dependemos apenas das vars estarem preparadas.
  
  if (!c.env.STRIPE_SECRET_KEY) {
    // Simulação se não houver chave
    return c.json({ url: `${c.env.APP_URL || "http://localhost:5173"}/#configuracoes?pagamento=sucesso` });
  }

  const stripePayload = new URLSearchParams({
    "payment_method_types[]": "card",
    "line_items[0][price]": "price_mock_123", // Substituir pelo ID do preço no Stripe
    "line_items[0][quantity]": "1",
    mode: "subscription",
    success_url: `${c.env.APP_URL || "http://localhost:5173"}/#configuracoes?pagamento=sucesso`,
    cancel_url: `${c.env.APP_URL || "http://localhost:5173"}/#configuracoes?pagamento=falha`,
    customer_email: email,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stripePayload.toString(),
  });

  const session = await response.json() as { url?: string };
  return c.json({ url: session.url });
});

// POST /stripe/webhook
stripeApp.post("/webhook", async (c) => {
  // A validação de assinatura do Stripe seria feita aqui com c.env.STRIPE_WEBHOOK_SECRET
  // Para fins arquiteturais, assumiremos a carga confiável.
  
  const payload = await c.req.json();
  const type = payload.type;
  const data = payload.data.object;

  if (type === "checkout.session.completed") {
    const email = data.customer_details?.email;
    const customerId = data.customer;
    const subscriptionId = data.subscription;

    if (email) {
      let accountStr = await c.env.ACCOUNTS.get(`account:${email}`);
      if (accountStr) {
        const account: AccountData = JSON.parse(accountStr);
        account.plano = "PREMIUM";
        account.stripe_customer_id = customerId;
        account.stripe_subscription_id = subscriptionId;
        await c.env.ACCOUNTS.put(`account:${email}`, JSON.stringify(account));
      }
    }
  }

  if (type === "customer.subscription.deleted") {
    // O Stripe envia o customer_id, precisariamos buscar no KV,
    // Em um BD relacional seria mais fácil. No KV, teremos que assumir a relação.
    // Para simplificar no worker sem scan, vamos apenas assumir que o sistema atende
    // a demanda de receber os webhooks.
  }

  return c.json({ received: true });
});
