import type { PdvDeBolsoDatabase } from "../database";

const PIX_KEY = "pix_chave";

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
}

