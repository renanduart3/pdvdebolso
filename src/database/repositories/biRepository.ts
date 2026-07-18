import type { PdvDeBolsoDatabase } from "../database";
import {
  calcularIndicadoresBI,
  type IndicadoresBI
} from "../../features/bi/calculos";

export class BiRepository {
  constructor(private readonly db: PdvDeBolsoDatabase) {}

  async obterIndicadores(agora = new Date()): Promise<IndicadoresBI> {
    const [transacoes, catalogo] = await Promise.all([
      this.db.transacoes.toArray(),
      this.db.catalogo.toArray()
    ]);
    return calcularIndicadoresBI(transacoes, catalogo, agora);
  }
}
