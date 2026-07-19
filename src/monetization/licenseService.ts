import { licencaRepository } from "../database/repositories";
import type { CheckoutLicenca } from "./api";
import type { LicencaLocal } from "./contracts";

export async function registrarCheckoutPendente(
  checkout: CheckoutLicenca
): Promise<void> {
  await licencaRepository.salvarPagamentoPendente({
    versao: 1,
    sessao_id: checkout.sessao_id,
    criado_em: new Date().toISOString()
  });
}

export function ativarLicencaLocal(licenca: LicencaLocal): Promise<void> {
  return licencaRepository.ativar(licenca);
}

export function limparCheckoutPendente(): Promise<void> {
  return licencaRepository.limparPagamentoPendente();
}
