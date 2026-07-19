import type { PdvDeBolsoDatabase } from "../database";
import type {
  EstadoLicenca,
  LicencaLocal,
  PagamentoLicencaPendente
} from "../../monetization/contracts";

const LICENCA_KEY = "licenca_sem_anuncios";
const PAGAMENTO_PENDENTE_KEY = "pagamento_licenca_pendente";

function dataIso(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    !Number.isNaN(new Date(valor).getTime())
  );
}

function licencaValida(valor: unknown): valor is LicencaLocal {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return false;
  }
  const licenca = valor as Record<string, unknown>;
  return (
    licenca.versao === 1 &&
    typeof licenca.token_restauracao === "string" &&
    licenca.token_restauracao.trim().length >= 16 &&
    dataIso(licenca.ativada_em) &&
    dataIso(licenca.verificada_em)
  );
}

function pagamentoPendenteValido(
  valor: unknown
): valor is PagamentoLicencaPendente {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return false;
  }
  const pagamento = valor as Record<string, unknown>;
  return (
    pagamento.versao === 1 &&
    typeof pagamento.sessao_id === "string" &&
    pagamento.sessao_id.trim().length >= 16 &&
    dataIso(pagamento.criado_em)
  );
}

export class LicencaRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async obterEstado(): Promise<EstadoLicenca> {
    const [licencaConfig, pagamentoConfig] = await Promise.all([
      this.db.configuracoes.get(LICENCA_KEY),
      this.db.configuracoes.get(PAGAMENTO_PENDENTE_KEY)
    ]);
    const licenca = licencaValida(licencaConfig?.valor)
      ? licencaConfig.valor
      : null;
    const pagamentoPendente = pagamentoPendenteValido(pagamentoConfig?.valor)
      ? pagamentoConfig.valor
      : null;

    return {
      plano: licenca ? "SEM_ANUNCIOS" : "GRATUITO",
      licenca,
      pagamento_pendente: pagamentoPendente
    };
  }

  async salvarPagamentoPendente(
    pagamento: PagamentoLicencaPendente
  ): Promise<void> {
    if (!pagamentoPendenteValido(pagamento)) {
      throw new TypeError("A sessão de pagamento recebida é inválida.");
    }
    await this.db.configuracoes.put({
      chave: PAGAMENTO_PENDENTE_KEY,
      valor: {
        ...pagamento,
        sessao_id: pagamento.sessao_id.trim()
      }
    });
  }

  async ativar(licenca: LicencaLocal): Promise<void> {
    if (!licencaValida(licenca)) {
      throw new TypeError("A licença recebida é inválida.");
    }
    await this.db.transaction("rw", this.db.configuracoes, async () => {
      await this.db.configuracoes.put({
        chave: LICENCA_KEY,
        valor: {
          ...licenca,
          token_restauracao: licenca.token_restauracao.trim()
        }
      });
      await this.db.configuracoes.delete(PAGAMENTO_PENDENTE_KEY);
    });
  }

  async limparPagamentoPendente(): Promise<void> {
    await this.db.configuracoes.delete(PAGAMENTO_PENDENTE_KEY);
  }
}
