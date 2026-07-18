import { database } from "../database";
import { CatalogoRepository } from "./catalogoRepository";
import { ClientesRepository } from "./clientesRepository";
import { ConfiguracoesRepository } from "./configuracoesRepository";
import { TransacoesRepository } from "./transacoesRepository";

export const catalogoRepository = new CatalogoRepository(database);
export const clientesRepository = new ClientesRepository(database);
export const configuracoesRepository = new ConfiguracoesRepository(database);
export const transacoesRepository = new TransacoesRepository(database);

