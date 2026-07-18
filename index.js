/**
 * Worker mínimo — só existe pra fazer 2 coisas:
 *   1) Receber o webhook do Mercado Pago/Stripe quando alguém paga $1
 *   2) Deixar o client consultar "esse pagamento já confirmou?"
 *
 * Nenhum dado de cliente/produto/venda passa por aqui — isso é 100%
 * local no navegador (ver schema/db.js). O KV só guarda a flag de pagamento.
 *
 * Bindings necessários (configurar no wrangler.toml):
 *   - KV Namespace: PAGAMENTOS
 *   - Secret: MP_WEBHOOK_SECRET (ou STRIPE_WEBHOOK_SECRET, dependendo do provedor)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS básico — o front roda em outro (sub)domínio do mesmo projeto Pages
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // troque pelo domínio real em produção
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/webhook/pagamento' && request.method === 'POST') {
      return handleWebhook(request, env, corsHeaders);
    }

    if (url.pathname === '/verificar-pagamento' && request.method === 'GET') {
      return handleVerificar(url, env, corsHeaders);
    }

    if (url.pathname === '/criar-preferencia' && request.method === 'POST') {
      return handleCriarPreferencia(request, env, corsHeaders);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};

/**
 * Passo 1 do fluxo: o client pede um link de pagamento.
 * Geramos um session_id nosso ANTES de mandar pro Mercado Pago, e usamos
 * esse mesmo id como "external_reference" — assim o webhook consegue
 * casar o pagamento de volta com o dispositivo que pediu.
 */
async function handleCriarPreferencia(request, env, corsHeaders) {
  const sessionId = crypto.randomUUID();

  // Marca como "pendente" no KV assim que a preferência é criada.
  // Isso evita condição de corrida: o client já pode começar a fazer
  // polling em /verificar-pagamento usando esse sessionId.
  await env.PAGAMENTOS.put(sessionId, JSON.stringify({ paid: false }), {
    expirationTtl: 60 * 60 * 24, // 24h — se não pagar nesse prazo, expira sozinho
  });

  const preferenceRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          title: 'Remover anúncios — Caderno Digital do Autônomo',
          quantity: 1,
          unit_price: 5.0, // ajuste pra R$5 ou o equivalente a ~$1 em BRL
          currency_id: 'BRL',
        },
      ],
      external_reference: sessionId,
      notification_url: 'https://SEU-WORKER.workers.dev/webhook/pagamento',
      back_urls: {
        success: 'https://seudominio.com/pagamento-confirmado',
      },
    }),
  });

  const preference = await preferenceRes.json();

  return new Response(
    JSON.stringify({ sessionId, checkoutUrl: preference.init_point }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Passo 2: Mercado Pago chama esse endpoint quando o pagamento é aprovado.
 * IMPORTANTE: sempre valide a notificação consultando a API do MP com o
 * payment_id recebido — nunca confie cegamente no payload do webhook,
 * ele pode ser forjado por qualquer um que descubra a URL.
 */
async function handleWebhook(request, env, corsHeaders) {
  const body = await request.json();

  // Formato de notificação do Mercado Pago (IPN/webhooks v2)
  const paymentId = body?.data?.id;
  if (!paymentId) {
    return new Response('Payload sem payment id', { status: 400, headers: corsHeaders });
  }

  // Consulta a API do MP pra confirmar que o pagamento é real e está aprovado
  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  const payment = await paymentRes.json();

  if (payment.status !== 'approved') {
    // Pode ser 'pending', 'rejected', etc. Não grava nada como pago.
    return new Response('ok', { headers: corsHeaders });
  }

  const sessionId = payment.external_reference;
  if (!sessionId) {
    return new Response('Sem external_reference', { status: 400, headers: corsHeaders });
  }

  await env.PAGAMENTOS.put(
    sessionId,
    JSON.stringify({ paid: true, paymentId, timestamp: Date.now() })
  );

  return new Response('ok', { headers: corsHeaders });
}

/**
 * Passo 3: o client faz polling nesse endpoint (a cada 2-3s, por até ~2min)
 * depois de voltar do checkout, até receber paid: true — aí salva o token
 * no IndexedDB local e libera o modo sem anúncios.
 */
async function handleVerificar(url, env, corsHeaders) {
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'session_id obrigatório' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const registro = await env.PAGAMENTOS.get(sessionId);
  const status = registro ? JSON.parse(registro) : { paid: false };

  return new Response(JSON.stringify(status), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
