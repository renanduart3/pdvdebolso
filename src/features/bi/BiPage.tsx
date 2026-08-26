import { useEffect, useMemo, useState } from "preact/hooks";

import { formatarCentavos } from "../../database/money";
import { biRepository } from "../../database/repositories";
import type { IndicadoresBI } from "./calculos";
import { criarXlsIndicadores } from "./exportarXls";
import styles from "./BiPage.module.css";

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível calcular o painel.";
}

function nomeMetodo(metodo: string): string {
  return metodo === "CARTAO" ? "CARTÃO" : metodo;
}

export function BiPage() {
  const [indicadores, setIndicadores] = useState<IndicadoresBI | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [exportado, setExportado] = useState(false);

  useEffect(() => {
    biRepository
      .obterIndicadores()
      .then(setIndicadores)
      .catch((error: unknown) => setErro(mensagemErro(error)));
  }, []);

  const maiorHora = useMemo(
    () =>
      Math.max(
        1,
        ...(indicadores?.horarios.barras.map((barra) => barra.quantidade) ?? [1])
      ),
    [indicadores]
  );
  const maiorDia = useMemo(
    () =>
      Math.max(
        1,
        ...(indicadores?.semana.dias.map((dia) => dia.valor_centavos) ?? [1])
      ),
    [indicadores]
  );

  if (erro) {
    return (
      <main class={styles.main}>
        <div class={`${styles.notice} ${styles.error}`} role="alert">
          <strong>ATENÇÃO:</strong> {erro}
        </div>
      </main>
    );
  }

  if (!indicadores) {
    return (
      <main class={styles.main}>
        <div class={styles.loading} role="status">
          <strong>CALCULANDO SEU NEGÓCIO...</strong>
          <span>Tudo acontece neste dispositivo.</span>
        </div>
      </main>
    );
  }

  const dadosParaExportacao = indicadores;
  const semMovimento =
    indicadores.caixa.mes_centavos === 0 &&
    indicadores.produtos.length === 0 &&
    indicadores.risco.vendas_mes_centavos === 0;

  function exportarXls() {
    const arquivo = criarXlsIndicadores(dadosParaExportacao);
    const blob = new Blob([arquivo.conteudo], {
      type: "application/vnd.ms-excel;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = arquivo.nome_arquivo;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setExportado(true);
  }

  return (
    <main class={styles.main}>
      <section class={styles.hero}>
        <div class={styles.heroTop}>
          <span class={styles.eyebrow}>INTELIGÊNCIA • 100% NO DISPOSITIVO</span>
          <button class={styles.exportButton} type="button" onClick={exportarXls}>
            EXPORTAR XLS
          </button>
        </div>
        <h1>NEGÓCIO EM NÚMEROS.</h1>
        <p>Sem planilha, sem nuvem e sem achismo. Seus próprios lançamentos contam a história.</p>
        {exportado && <span class={styles.exportStatus} role="status">ARQUIVO XLS GERADO NESTE DISPOSITIVO.</span>}
      </section>

      {semMovimento && (
        <div class={styles.emptyIntro}>
          <strong>AINDA NÃO HÁ MOVIMENTO SUFICIENTE.</strong>
          <span>Registre vendas e o painel começa a aprender na hora.</span>
        </div>
      )}

      <section class={styles.cashSection} aria-labelledby="cash-title">
        <div class={styles.sectionHeading}>
          <span>01</span>
          <div>
            <h2 id="cash-title">TERMÔMETRO DO CAIXA</h2>
            <p>Dinheiro efetivamente recebido, incluindo pagamentos de fiado.</p>
          </div>
        </div>
        <div class={styles.cashGrid}>
          <article class={`${styles.metricCard} ${styles.green}`}>
            <span>RECEBIDO HOJE</span>
            <strong>{formatarCentavos(indicadores.caixa.hoje_centavos)}</strong>
          </article>
          <article class={`${styles.metricCard} ${styles.orange}`}>
            <span>RECEBIDO NO MÊS</span>
            <strong>{formatarCentavos(indicadores.caixa.mes_centavos)}</strong>
          </article>
          <article class={styles.methodsCard}>
            <h3>COMO O DINHEIRO ENTROU</h3>
            {indicadores.caixa.por_metodo.map((item) => (
              <div class={styles.methodRow} key={item.metodo}>
                <div>
                  <strong>{nomeMetodo(item.metodo)}</strong>
                  <span>{formatarCentavos(item.valor_centavos)}</span>
                </div>
                <div class={styles.progress} aria-label={`${item.percentual}% por ${nomeMetodo(item.metodo)}`}>
                  <span style={{ width: `${item.percentual}%` }} />
                </div>
                <strong>{item.percentual.toLocaleString("pt-BR")}%</strong>
              </div>
            ))}
          </article>
        </div>
      </section>

      <div class={styles.twoColumns}>
        <section class={styles.dataSection} aria-labelledby="peak-title">
          <div class={styles.sectionHeading}>
            <span>02</span>
            <div>
              <h2 id="peak-title">HORÁRIOS DE PICO</h2>
              <p>Vendas quitadas nos últimos 30 dias.</p>
            </div>
          </div>
          <p class={styles.insight}>
            {indicadores.horarios.pico
              ? `SEU MAIOR MOVIMENTO É ENTRE ${indicadores.horarios.pico.inicio}H E ${indicadores.horarios.pico.fim}H.`
              : "AINDA NÃO HÁ HORÁRIO DE PICO."}
          </p>
          <div class={styles.hourChart} aria-label="Vendas por hora">
            {indicadores.horarios.barras.map((barra) => (
              <div
                class={styles.hourColumn}
                key={barra.hora}
                title={`${String(barra.hora).padStart(2, "0")}h: ${barra.quantidade} venda${barra.quantidade === 1 ? "" : "s"}`}
              >
                <span>{barra.quantidade || ""}</span>
                <div
                  style={{
                    height: `${Math.max(4, (barra.quantidade / maiorHora) * 100)}%`
                  }}
                />
                <small>{barra.hora}h</small>
              </div>
            ))}
          </div>
        </section>

        <section class={styles.dataSection} aria-labelledby="week-title">
          <div class={styles.sectionHeading}>
            <span>03</span>
            <div>
              <h2 id="week-title">MAPA SEMANAL</h2>
              <p>Faturamento quitado dos últimos 30 dias.</p>
            </div>
          </div>
          <p class={styles.insight}>
            {indicadores.semana.melhor
              ? `${indicadores.semana.melhor.nome} REPRESENTA ${indicadores.semana.melhor.percentual.toLocaleString("pt-BR")}% DO PERÍODO.`
              : "OS DIAS FORTES APARECERÃO AQUI."}
          </p>
          <div class={styles.weekChart}>
            {indicadores.semana.dias.map((dia) => (
              <div class={styles.dayRow} key={dia.indice}>
                <strong>{dia.nome.slice(0, 3)}</strong>
                <div class={styles.dayTrack}>
                  <span
                    style={{ width: `${(dia.valor_centavos / maiorDia) * 100}%` }}
                  />
                </div>
                <small>{dia.percentual.toLocaleString("pt-BR")}%</small>
              </div>
            ))}
          </div>
          {indicadores.semana.pior && (
            <small class={styles.subInsight}>
              DIA MAIS FRACO: {indicadores.semana.pior.nome}.
            </small>
          )}
        </section>
      </div>

      <div class={styles.twoColumns}>
        <section class={styles.dataSection} aria-labelledby="products-title">
          <div class={styles.sectionHeading}>
            <span>04</span>
            <div>
              <h2 id="products-title">PRODUTOS CAMPEÕES</h2>
              <p>Top 5 por quantidade entre as vendas quitadas.</p>
            </div>
          </div>
          {indicadores.produtos.length === 0 ? (
            <p class={styles.emptyText}>SEM PRODUTOS QUITADOS AINDA.</p>
          ) : (
            <ol class={styles.ranking}>
              {indicadores.produtos.map((produto, indice) => (
                <li key={produto.id_produto}>
                  <span>{String(indice + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{produto.nome}</strong>
                    <small>{produto.quantidade} UNIDADES</small>
                  </div>
                  <strong>{formatarCentavos(produto.receita_centavos)}</strong>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section class={styles.dataSection} aria-labelledby="stock-title">
          <div class={styles.sectionHeading}>
            <span>05</span>
            <div>
              <h2 id="stock-title">RITMO DE REPOSIÇÃO</h2>
              <p>Velocidade de saída dos últimos 7 dias.</p>
            </div>
          </div>
          {indicadores.reposicao.length === 0 ? (
            <p class={styles.emptyText}>SEM SAÍDAS RECENTES DE PRODUTOS.</p>
          ) : (
            <ul class={styles.restockList}>
              {indicadores.reposicao.map((item) => (
                <li key={item.id_produto}>
                  <span class={styles.tag}>AÇÃO</span>
                  <strong>{item.nome}</strong>
                  <p>
                    Você vende em média{" "}
                    <strong>{item.media_diaria.toLocaleString("pt-BR")}</strong>{" "}
                    por dia.
                    {item.estoque_atual === null
                      ? " Ative o estoque para comparar o saldo."
                      : ` Estoque atual: ${item.estoque_atual}.`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        class={`${styles.riskSection} ${
          indicadores.risco.percentual >= 30 ? styles.highRisk : styles.lowRisk
        }`}
        aria-labelledby="risk-title"
      >
        <div class={styles.sectionHeading}>
          <span>06</span>
          <div>
            <h2 id="risk-title">SAÚDE DO FIADO</h2>
            <p>Dívida ativa comparada ao valor vendido neste mês.</p>
          </div>
        </div>
        <div class={styles.riskContent}>
          <strong>{indicadores.risco.percentual.toLocaleString("pt-BR")}%</strong>
          <p>
            {indicadores.risco.percentual >= 30 ? "ATENÇÃO: " : ""}
            {formatarCentavos(indicadores.risco.divida_ativa_centavos)} ainda
            estão pendentes sobre{" "}
            {formatarCentavos(indicadores.risco.vendas_mes_centavos)} vendidos no
            mês.
          </p>
        </div>
      </section>
    </main>
  );
}
