import type { JSX } from "preact";
import { useState } from "preact/hooks";

import type { UserSession } from "../../monetization/contracts";
import styles from "./PremiumPage.module.css";

// ──────────────────────────────────────
// Dados estáticos das features
// ──────────────────────────────────────
const features = [
  {
    number: "01",
    icon: "☁️",
    color: "green" as const,
    name: "COFRE NA NUVEM",
    desc: "Se seu celular quebrar, sumir ou ser roubado, você restaura toda a sua operação em outro aparelho em segundos. Clientes, produtos, transações — tudo de volta.",
    pill: "PROTEÇÃO TOTAL",
  },
  {
    number: "02",
    icon: "📊",
    color: "orange" as const,
    name: "BI COMPLETO",
    desc: "Horários de pico, mapa semanal de vendas e previsão de estoque. Saiba exatamente quando repor mercadoria antes de ficar no zero.",
    pill: "INTELIGÊNCIA REAL",
  },
  {
    number: "03",
    icon: "💬",
    color: "purple" as const,
    name: "COBRANÇA NO WHATSAPP",
    desc: "Um toque manda a mensagem de cobrança direto pro WhatsApp do cliente. Fim da inadimplência, sem constrangimento.",
    pill: "ZERO INADIMPLÊNCIA",
  },
  {
    number: "04",
    icon: "🚫",
    color: "pink" as const,
    name: "SEM ANÚNCIOS",
    desc: "Interface 100% limpa. Sem banners, sem distrações, sem nada que atrapalhe o momento de finalizar uma venda.",
    pill: "FOCO TOTAL",
  },
] as const;

const compareRows = [
  { feature: "PDV — vender, cobrar, fiado",      free: true,  premium: true  },
  { feature: "Catálogo e estoque",               free: true,  premium: true  },
  { feature: "Clientes e histórico",             free: true,  premium: true  },
  { feature: "Backup local (exportar arquivo)",  free: true,  premium: true  },
  { feature: "Funciona 100% offline",            free: true,  premium: true  },
  { feature: "Cofre na Nuvem (snapshot)",        free: false, premium: true  },
  { feature: "BI completo e horários de pico",   free: false, premium: true  },
  { feature: "Cobrança por WhatsApp",            free: false, premium: true  },
  { feature: "Interface sem anúncios",           free: false, premium: true  },
] as const;

const faqItems = [
  {
    q: "COMO FUNCIONA O PAGAMENTO?",
    a: "O pagamento é processado via Stripe com cartão de crédito ou débito. A cobrança é mensal e você pode cancelar a qualquer momento sem multa.",
  },
  {
    q: "POSSO CANCELAR QUANDO QUISER?",
    a: "Sim. Cancele pelo portal do Stripe e o acesso Premium fica ativo até o final do período pago. Não há reembolso proporcional.",
  },
  {
    q: "MEUS DADOS VÃO PARA A NUVEM?",
    a: "Apenas o Cofre em Nuvem envia seus dados para a nuvem — e somente quando você clicar em Salvar Cofre. Todos os dados do dia a dia ficam 100% no seu dispositivo.",
  },
] as const;

// ──────────────────────────────────────
// Tipos
// ──────────────────────────────────────
type PremiumPageProps = {
  online: boolean;
  sessao: UserSession | null;
  onAssinar: () => Promise<void>;
  onLogin: (email: string) => Promise<void>;
  onGerenciar?: () => void;
};

// ──────────────────────────────────────
// Componente principal
// ──────────────────────────────────────
export function PremiumPage({
  online,
  sessao,
  onAssinar,
  onLogin,
  onGerenciar,
}: PremiumPageProps) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [faqAberto, setFaqAberto] = useState<number | null>(null);

  // Modo login inline: exibido quando o usuário quer assinar mas não tem sessão
  const [modoLogin, setModoLogin] = useState(false);
  const [email, setEmail] = useState("");

  async function handleAssinar() {
    if (!sessao) {
      setModoLogin(true);
      return;
    }
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      await onAssinar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.");
      setProcessando(false);
    }
    // Se não houve erro, foi redirecionado — não chama setProcessando(false)
  }

  async function handleLogin(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessando(true);
    setErro(null);
    setSucesso(null);
    try {
      await onLogin(email);
      setSucesso(
        "Link mágico enviado! Verifique sua caixa de entrada e clique no link para continuar."
      );
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar link de acesso.");
    } finally {
      setProcessando(false);
    }
  }

  function toggleFaq(index: number) {
    setFaqAberto((atual) => (atual === index ? null : index));
  }

  // ── ESTADO: PREMIUM JÁ ATIVO ──
  if (sessao?.plano === "PREMIUM") {
    return (
      <main class={styles.page}>
        <div class={styles.activeHero}>
          <div class={styles.activeBadge}>👑 PREMIUM ATIVO</div>
          <h1 class={styles.activeTitle}>TUDO LIBERADO.</h1>
          <p class={styles.activeSub}>
            Você tem acesso completo a todos os recursos. Seu negócio está
            protegido, inteligente e livre de distrações.
          </p>
          <p class={styles.activeEmail}>{sessao.email.toUpperCase()}</p>
          {onGerenciar && (
            <button class={styles.manageBtn} type="button" onClick={onGerenciar}>
              GERENCIAR ASSINATURA
            </button>
          )}
        </div>
        <ActiveFeaturesGrid />
      </main>
    );
  }

  // ── ESTADO: GRATUITO / SEM SESSÃO ──
  return (
    <main class={styles.page}>
      {/* HERO */}
      <section class={styles.hero}>
        <span class={styles.heroEyebrow}>PDV DE BOLSO PREMIUM</span>

        <h1 class={styles.heroTitle}>
          SEU NEGÓCIO.<br />
          <em>SEM LIMITES.</em>
        </h1>

        <p class={styles.heroSub}>
          Proteja seus dados, elimine a inadimplência e tome decisões com dados
          reais — tudo pelo preço de uma marmita por mês.
        </p>

        <div class={styles.heroPriceBlock} aria-label="Preço: R$14,90 por mês">
          <span class={styles.heroPriceCurrency}>R$</span>
          <span class={styles.heroPriceAmount}>14</span>
          <span class={styles.heroPricePeriod}>,90<br />/mês</span>
        </div>

        {/* Notices */}
        {erro && (
          <div class={`${styles.notice} ${styles.error}`} role="alert">
            <strong>ERRO:</strong> {erro}
            <button type="button" onClick={() => setErro(null)} aria-label="Fechar erro">
              ×
            </button>
          </div>
        )}
        {sucesso && (
          <div class={`${styles.notice} ${styles.success}`} role="status">
            <strong>PRONTO:</strong> {sucesso}
            <button type="button" onClick={() => setSucesso(null)} aria-label="Fechar">
              ×
            </button>
          </div>
        )}

        {/* CTA ou Login Inline */}
        {modoLogin ? (
          <div class={styles.loginSection}>
            <h2 class={styles.loginTitle}>CRIE SUA CONTA</h2>
            <p class={styles.loginSub}>
              Enviamos um link mágico para o seu e-mail. Clique nele e você
              será redirecionado para o checkout.
            </p>
            <form class={styles.loginForm} onSubmit={handleLogin}>
              <label class={styles.loginLabel}>
                SEU MELHOR E-MAIL
                <input
                  type="email"
                  value={email}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="voce@email.com"
                  required
                  autoComplete="email"
                />
              </label>
              <button
                class={styles.loginSubmit}
                type="submit"
                disabled={processando || !email || !online}
              >
                {processando ? "ENVIANDO..." : "ENVIAR LINK DE ACESSO"}
              </button>
              <button
                class={styles.loginBack}
                type="button"
                onClick={() => { setModoLogin(false); setErro(null); setSucesso(null); }}
              >
                ← Voltar
              </button>
            </form>
          </div>
        ) : (
          <>
            {!online && (
              <span class={styles.heroOfflineNote}>
                📡 SEM CONEXÃO — Conecte-se para assinar
              </span>
            )}
            <button
              class={styles.heroCta}
              type="button"
              onClick={handleAssinar}
              disabled={processando || (!online && !sessao)}
              aria-label="Assinar o Plano Premium do PDV de Bolso"
            >
              {processando
                ? "REDIRECIONANDO..."
                : sessao
                ? "ASSINAR AGORA — R$14,90/MÊS"
                : "QUERO O PREMIUM"}
            </button>
            <p class={styles.heroCtaNote}>
              Pagamento seguro via Stripe · Cancele quando quiser
            </p>
          </>
        )}
      </section>

      {/* FEATURES GRID */}
      <section class={styles.featuresSection}>
        <span class={styles.sectionLabel}>O QUE VOCÊ LEVA</span>
        <h2 class={styles.sectionTitle}>4 ARMAS<br />DO NEGÓCIO.</h2>

        <div class={styles.featuresGrid}>
          {features.map((f) => (
            <article key={f.number} class={`${styles.featureCard} ${styles[f.color]}`}>
              <span class={styles.featureNumber}>{f.number}</span>
              <span class={styles.featureIcon} aria-hidden="true">{f.icon}</span>
              <h3 class={styles.featureName}>{f.name}</h3>
              <p class={styles.featureDesc}>{f.desc}</p>
              <span class={styles.featurePill}>{f.pill}</span>
            </article>
          ))}
        </div>
      </section>

      {/* COMPARAÇÃO */}
      <section class={styles.compareSection}>
        <span class={styles.sectionLabel}>COMPARE OS PLANOS</span>
        <h2 class={styles.sectionTitle}>GRATUITO<br />× PREMIUM.</h2>

        <table class={styles.compareTable} aria-label="Comparação de planos Gratuito e Premium">
          <thead>
            <tr>
              <th scope="col">RECURSO</th>
              <th scope="col">GRATUITO</th>
              <th scope="col" class={styles.thPremium}>PREMIUM</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.feature}>
                <td>{row.feature}</td>
                <td>
                  {row.free
                    ? <span class={styles.checkYes} aria-label="Incluído">✓</span>
                    : <span class={styles.checkNo} aria-label="Não incluído">—</span>}
                </td>
                <td>
                  <span class={styles.checkYes} aria-label="Incluído">✓</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* FAQ */}
      <section class={styles.faqSection} aria-label="Perguntas frequentes">
        <span class={styles.sectionLabel}>DÚVIDAS COMUNS</span>
        <h2 class={styles.sectionTitle}>FAQ.</h2>

        {faqItems.map((item, i) => (
          <div class={styles.faqItem} key={item.q}>
            <button
              class={styles.faqQuestion}
              type="button"
              onClick={() => toggleFaq(i)}
              aria-expanded={faqAberto === i}
              aria-controls={`faq-answer-${i}`}
            >
              {faqAberto === i ? "▾" : "▸"} {item.q}
            </button>
            {faqAberto === i && (
              <div id={`faq-answer-${i}`} class={styles.faqAnswer} role="region">
                {item.a}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* CTA FINAL */}
      <section class={styles.ctaFinal}>
        <h2 class={styles.ctaFinalTitle}>PRONTO<br />PRA CRESCER?</h2>
        <p class={styles.ctaFinalSub}>
          Menos de R\$0,50 por dia para proteger tudo que você construiu.
        </p>
        <button
          class={styles.ctaFinalBtn}
          type="button"
          onClick={handleAssinar}
          disabled={processando || (!online && !sessao)}
        >
          {processando ? "AGUARDE..." : "ASSINAR AGORA — R$14,90/MÊS"}
        </button>
        <span class={styles.ctaFinalNote}>
          Stripe · SSL · Cancele quando quiser
        </span>
      </section>
    </main>
  );
}

// ──────────────────────────────────────
// Sub-componente: grid de confirmação
// para usuário já premium
// ──────────────────────────────────────
function ActiveFeaturesGrid() {
  return (
    <section class={styles.featuresSection}>
      <span class={styles.sectionLabel}>SEUS RECURSOS ATIVOS</span>
      <h2 class={styles.sectionTitle}>TUDO<br />LIBERADO.</h2>
      <div class={styles.featuresGrid}>
        {features.map((f) => (
          <article key={f.number} class={`${styles.featureCard} ${styles[f.color]}`}>
            <span class={styles.featureNumber}>{f.number}</span>
            <span class={styles.featureIcon} aria-hidden="true">{f.icon}</span>
            <h3 class={styles.featureName}>{f.name}</h3>
            <p class={styles.featureDesc}>{f.desc}</p>
            <span class={styles.featurePill}>✓ ATIVO</span>
          </article>
        ))}
      </div>
    </section>
  );
}
