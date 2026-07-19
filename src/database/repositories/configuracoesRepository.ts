import type { PdvDeBolsoDatabase } from "../database";
import {
  ehTemaAplicacao,
  TEMA_PADRAO,
  type TemaAplicacao
} from "../../theme/registry";

const PIX_KEY = "pix_chave";
const VALIDAR_ESTOQUE_KEY = "validar_estoque_venda";
const TEMA_KEY = "tema_aplicacao";

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
}
