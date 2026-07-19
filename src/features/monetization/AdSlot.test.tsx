import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProvedorAnuncios } from "../../monetization/contracts";
import { AdSlot } from "./AdSlot";

afterEach(cleanup);

describe("AdSlot", () => {
  it("monta publicidade somente online e na versão gratuita", () => {
    const desmontar = vi.fn();
    const montar = vi.fn((elemento: HTMLElement) => {
      elemento.textContent = "ANÚNCIO DE TESTE";
      return desmontar;
    });
    const provedor: ProvedorAnuncios = {
      id: "teste",
      montar
    };
    const { unmount } = render(
      <AdSlot online semAnuncios={false} provedor={provedor} />
    );

    expect(screen.getByLabelText("Publicidade")).toHaveTextContent(
      "ANÚNCIO DE TESTE"
    );
    expect(montar).toHaveBeenCalledOnce();
    unmount();
    expect(desmontar).toHaveBeenCalledOnce();
  });

  it("não deixa espaço vazio offline ou com licença", () => {
    const provedor: ProvedorAnuncios = {
      id: "teste",
      montar: vi.fn()
    };
    const { rerender } = render(
      <AdSlot online={false} semAnuncios={false} provedor={provedor} />
    );
    expect(screen.queryByLabelText("Publicidade")).not.toBeInTheDocument();

    rerender(<AdSlot online semAnuncios provedor={provedor} />);
    expect(screen.queryByLabelText("Publicidade")).not.toBeInTheDocument();
    expect(provedor.montar).not.toHaveBeenCalled();
  });
});
