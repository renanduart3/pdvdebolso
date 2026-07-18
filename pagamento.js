import { salvarConfig, lerConfig } from '../schema/db.js';

const WORKER_URL = 'https://SEU-WORKER.workers.dev'; // troque pelo seu domínio do Worker

/**
 * Chamado quando o usuário clica em "Remover anúncios".
 * Abre o checkout do Mercado Pago numa nova aba e começa o polling.
 */
async function iniciarRemocaoDeAds(db) {
  const res = await fetch(`${WORKER_URL}/criar-preferencia`, { method: 'POST' });
  const { sessionId, checkoutUrl } = await res.json();

  // Guarda o sessionId localmente ANTES de sair da página —
  // é isso que permite retomar o polling se o usuário fechar e voltar.
  await salvarConfig(db, 'pagamento_session_id', sessionId);

  window.open(checkoutUrl, '_blank');
  aguardarConfirmacao(db, sessionId);
}

/**
 * Faz polling a cada 3s por até 2 minutos. Se o usuário fechar o app
 * antes de confirmar, o próximo boot do app deve chamar retomarPolling()
 * (ver abaixo) usando o sessionId salvo no IndexedDB.
 */
async function aguardarConfirmacao(db, sessionId, tentativas = 0) {
  if (tentativas > 40) return; // ~2min de tentativas, desiste e espera o próximo boot

  const res = await fetch(`${WORKER_URL}/verificar-pagamento?session_id=${sessionId}`);
  const status = await res.json();

  if (status.paid) {
    await salvarConfig(db, 'ads_removed', true);
    document.dispatchEvent(new CustomEvent('ads-removidos'));
    return;
  }

  setTimeout(() => aguardarConfirmacao(db, sessionId, tentativas + 1), 3000);
}

/**
 * Chame isso no boot do app. Se existir um pagamento pendente de uma
 * sessão anterior (usuário fechou a aba no meio do checkout), retoma
 * a verificação sem precisar que ele pague de novo.
 */
async function retomarPollingSePendente(db) {
  const jaRemoveu = await lerConfig(db, 'ads_removed');
  if (jaRemoveu) return;

  const sessionIdPendente = await lerConfig(db, 'pagamento_session_id');
  if (sessionIdPendente) {
    aguardarConfirmacao(db, sessionIdPendente);
  }
}

export { iniciarRemocaoDeAds, retomarPollingSePendente };
