import { useEffect, useRef } from "preact/hooks";

import type {
  PosicaoAnuncio,
  ProvedorAnuncios
} from "../../monetization/contracts";
import styles from "./AdSlot.module.css";

type AdSlotProps = {
  online: boolean;
  semAnuncios: boolean;
  provedor: ProvedorAnuncios | null;
  posicao?: PosicaoAnuncio;
};

export function AdSlot({
  online,
  semAnuncios,
  provedor,
  posicao = "BARRA_LATERAL"
}: AdSlotProps) {
  const elementoRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const elemento = elementoRef.current;
    if (!elemento || !online || semAnuncios || !provedor) return;
    return provedor.montar(elemento, posicao);
  }, [online, posicao, provedor, semAnuncios]);

  if (!online || semAnuncios || !provedor) return null;

  return (
    <aside
      ref={elementoRef}
      class={styles.slot}
      aria-label="Publicidade"
      data-ad-provider={provedor.id}
      data-ad-position={posicao}
    />
  );
}
