import type { PdvDeBolsoDatabase } from "../database";
import {
  ehTemaAplicacao,
  TEMA_PADRAO,
  type TemaAplicacao
} from "../../theme/registry";

const PIX_KEY = "pix_chave";
const VALIDAR_ESTOQUE_KEY = "validar_estoque_venda";
const TEMA_KEY = "tema_aplicacao";
const IDIOMA_KEY = "idioma_aplicacao";
const MOEDA_KEY = "moeda_aplicacao";

export type IdiomaAplicacao = "pt-BR" | "en-US" | "es-ES";
export type MoedaAplicacao = "BRL" | "USD" | "EUR";

export const IDIOMAS_SUPORTADOS: { id: IdiomaAplicacao; nome: string }[] = [
  { id: "pt-BR", nome: "Português (Brasil)" },
  { id: "en-US", nome: "English (US)" },
  { id: "es-ES", nome: "Español" }
];

export const MOEDAS_SUPORTADAS: { id: MoedaAplicacao; nome: string; simbolo: string }[] = [
  { id: "BRL", nome: "Real Brasileiro", simbolo: "R$" },
  { id: "USD", nome: "Dólar Americano", simbolo: "$" },
  { id: "EUR", nome: "Euro", simbolo: "€" }
];

export class ConfiguracoesRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async obterChavePix(): Promise<string> {
    const configuracao = await this.db.configuracoes.get(PIX_KEY);
    return typeof configuracao?.valor === "string" ? configuracao.valor : "";
  }

  async salvarChavePix(chavePix: string): Promise<void> {
    await this.db.configuracoes.put({
      chave: PIX_KEY,
      valor: chavePix.trim()
    });
  }

  async obterValidacaoEstoque(): Promise<boolean> {
    const configuracao = await this.db.configuracoes.get(VALIDAR_ESTOQUE_KEY);
    return configuracao?.valor === true;
  }

  async salvarValidacaoEstoque(validar: boolean): Promise<void> {
    await this.db.configuracoes.put({
      chave: VALIDAR_ESTOQUE_KEY,
      valor: validar
    });
  }

  async obterTema(): Promise<TemaAplicacao> {
    const configuracao = await this.db.configuracoes.get(TEMA_KEY);
    return ehTemaAplicacao(configuracao?.valor)
      ? configuracao.valor
      : TEMA_PADRAO;
  }

  async salvarTema(tema: TemaAplicacao): Promise<void> {
    if (!ehTemaAplicacao(tema)) {
      throw new Error("Tema da aplicação inválido.");
    }
    await this.db.configuracoes.put({
      chave: TEMA_KEY,
      valor: tema
    });
  }

  async obterIdioma(): Promise<IdiomaAplicacao> {
    const configuracao = await this.db.configuracoes.get(IDIOMA_KEY);
    const valor = configuracao?.valor;
    return valor === "en-US" || valor === "es-ES" ? valor : "pt-BR";
  }

  async salvarIdioma(idioma: IdiomaAplicacao): Promise<void> {
    await this.db.configuracoes.put({
      chave: IDIOMA_KEY,
      valor: idioma
    });
  }

  async obterMoeda(): Promise<MoedaAplicacao> {
    const configuracao = await this.db.configuracoes.get(MOEDA_KEY);
    const valor = configuracao?.valor;
    return valor === "USD" || valor === "EUR" ? valor : "BRL";
  }

  async salvarMoeda(moeda: MoedaAplicacao): Promise<void> {
    await this.db.configuracoes.put({
      chave: MOEDA_KEY,
      valor: moeda
    });
  }
}
