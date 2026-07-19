export function filtrarDecimal(valor: string, casasDecimais = 2): string {
  const limpo = valor.replace(".", ",").replace(/[^\d,]/g, "");
  const separador = limpo.indexOf(",");
  if (separador < 0) return limpo;

  const inteiro = limpo.slice(0, separador).replace(/\D/g, "");
  const decimal = limpo
    .slice(separador + 1)
    .replace(/\D/g, "")
    .slice(0, casasDecimais);
  return `${inteiro},${decimal}`;
}

export function filtrarInteiro(
  valor: string,
  permitirNegativo = false
): string {
  const negativo = permitirNegativo && valor.trimStart().startsWith("-");
  const digitos = valor.replace(/\D/g, "");
  return negativo ? `-${digitos}` : digitos;
}
