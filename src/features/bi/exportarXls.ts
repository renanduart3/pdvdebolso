import type { IndicadoresBI } from "./calculos";

function escaparXml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function celula(
  valor: string | number,
  tipo: "String" | "Number" = "String",
  estilo?: "cabecalho" | "moeda" | "percentual"
): string {
  const atributoEstilo = estilo ? ` ss:StyleID="${estilo}"` : "";
  return `<Cell${atributoEstilo}><Data ss:Type="${tipo}">${
    tipo === "String" ? escaparXml(String(valor)) : valor
  }</Data></Cell>`;
}

function linha(celulas: string[]): string {
  return `<Row>${celulas.join("")}</Row>`;
}

function planilha(nome: string, linhas: string[]): string {
  return `<Worksheet ss:Name="${escaparXml(nome)}"><Table>${linhas.join(
    ""
  )}</Table></Worksheet>`;
}

function cabecalho(...titulos: string[]): string {
  return linha(titulos.map((titulo) => celula(titulo, "String", "cabecalho")));
}

function reais(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export function criarXlsIndicadores(
  indicadores: IndicadoresBI,
  geradoEm = new Date()
): { conteudo: string; nome_arquivo: string } {
  const resumo = [
    cabecalho("INDICADOR", "VALOR"),
    linha([
      celula("RECEBIDO HOJE"),
      celula(reais(indicadores.caixa.hoje_centavos), "Number", "moeda")
    ]),
    linha([
      celula("RECEBIDO NO MÊS"),
      celula(reais(indicadores.caixa.mes_centavos), "Number", "moeda")
    ]),
    linha([
      celula("DÍVIDA ATIVA"),
      celula(reais(indicadores.risco.divida_ativa_centavos), "Number", "moeda")
    ]),
    linha([
      celula("VENDAS DO MÊS"),
      celula(reais(indicadores.risco.vendas_mes_centavos), "Number", "moeda")
    ]),
    linha([
      celula("RISCO DO FIADO"),
      celula(indicadores.risco.percentual / 100, "Number", "percentual")
    ]),
    linha([celula("GERADO EM"), celula(geradoEm.toISOString())])
  ];

  const metodos = [
    cabecalho("MÉTODO", "VALOR", "PERCENTUAL"),
    ...indicadores.caixa.por_metodo.map((item) =>
      linha([
        celula(item.metodo === "CARTAO" ? "CARTÃO" : item.metodo),
        celula(reais(item.valor_centavos), "Number", "moeda"),
        celula(item.percentual / 100, "Number", "percentual")
      ])
    )
  ];

  const horarios = [
    cabecalho("HORA", "QUANTIDADE DE VENDAS"),
    ...indicadores.horarios.barras.map((item) =>
      linha([celula(item.hora, "Number"), celula(item.quantidade, "Number")])
    )
  ];

  const semana = [
    cabecalho("DIA", "FATURAMENTO", "PERCENTUAL"),
    ...indicadores.semana.dias.map((dia) =>
      linha([
        celula(dia.nome),
        celula(reais(dia.valor_centavos), "Number", "moeda"),
        celula(dia.percentual / 100, "Number", "percentual")
      ])
    )
  ];

  const produtos = [
    cabecalho("PRODUTO", "QUANTIDADE", "RECEITA"),
    ...indicadores.produtos.map((produto) =>
      linha([
        celula(produto.nome),
        celula(produto.quantidade, "Number"),
        celula(reais(produto.receita_centavos), "Number", "moeda")
      ])
    )
  ];

  const reposicao = [
    cabecalho(
      "PRODUTO",
      "QUANTIDADE EM 7 DIAS",
      "MÉDIA DIÁRIA",
      "ESTOQUE ATUAL"
    ),
    ...indicadores.reposicao.map((item) =>
      linha([
        celula(item.nome),
        celula(item.quantidade_7_dias, "Number"),
        celula(item.media_diaria, "Number"),
        item.estoque_atual === null
          ? celula("NÃO CONTROLADO")
          : celula(item.estoque_atual, "Number")
      ])
    )
  ];

  const conteudo = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>
  <Style ss:ID="cabecalho"><Font ss:Bold="1"/><Interior ss:Color="#B8FF29" ss:Pattern="Solid"/></Style>
  <Style ss:ID="moeda"><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style>
  <Style ss:ID="percentual"><NumberFormat ss:Format="0.00%"/></Style>
 </Styles>
 ${planilha("RESUMO", resumo)}
 ${planilha("MÉTODOS", metodos)}
 ${planilha("HORÁRIOS", horarios)}
 ${planilha("SEMANA", semana)}
 ${planilha("PRODUTOS", produtos)}
 ${planilha("REPOSIÇÃO", reposicao)}
</Workbook>`;

  return {
    conteudo,
    nome_arquivo: `pdv-de-bolso-inteligencia-${geradoEm
      .toISOString()
      .slice(0, 10)}.xls`
  };
}
