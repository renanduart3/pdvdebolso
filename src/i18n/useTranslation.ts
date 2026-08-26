import { useEffect, useState } from "preact/hooks";
import { configuracoesRepository } from "../database/repositories";
import { Dicionarios, type TranslationKey } from "./dictionaries";

export function useTranslation() {
  const [idioma, setIdioma] = useState<string>("pt-BR");

  useEffect(() => {
    configuracoesRepository.obterIdioma().then((i) => {
      setIdioma(i || "pt-BR");
    });
    
    // In a real app we would use signals or context to react to changes instantly
    // but for this MVP, polling or reloading works (the app reloads or user goes to settings)
  }, []);

  function t(key: TranslationKey): string {
    const dict = Dicionarios[idioma as keyof typeof Dicionarios] || Dicionarios["pt-BR"];
    return dict[key] || Dicionarios["pt-BR"][key] || key;
  }

  return { t };
}
