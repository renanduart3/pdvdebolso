import { database } from "../database";
import { BiRepository } from "./biRepository";
import { BackupRepository } from "./backupRepository";
import { CatalogoRepository } from "./catalogoRepository";
import { ClientesRepository } from "./clientesRepository";
import { ConfiguracoesRepository } from "./configuracoesRepository";
import { TransacoesRepository } from "./transacoesRepository";

export const catalogoRepository = new CatalogoRepository(database);
export const backupRepository = new BackupRepository(database);
export const biRepository = new BiRepository(database);
export const clientesRepository = new ClientesRepository(database);
export const configuracoesRepository = new ConfiguracoesRepository(database);
export const transacoesRepository = new TransacoesRepository(database);
