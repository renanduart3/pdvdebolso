---
name: indexeddb-mechanic
description: Implementar e otimizar a persistência IndexedDB do PDV de Bolso, incluindo schema Dexie, migrações, repositórios, consultas, agregações client-side, inadimplência, BI, exportação, importação e validação de backup. Usar quando a tarefa envolver clientes, catálogo, transações, fiado, relatórios ou armazenamento local.
---

# Mecânico de IndexedDB

1. Ler `AGENTS.md`, `docs/architecture.md` e `docs/schema.md` por completo.
2. Confirmar que a mudança cabe no schema atual. Se exigir campo, entidade ou
   semântica nova, parar e pedir permissão explícita antes de alterar o schema.
3. Implementar persistência em Dexie/IndexedDB com operações atômicas.
4. Manter transações financeiras imutáveis e valores em centavos.
5. Criar índices apenas quando sustentados por uma consulta concreta.
6. Validar entradas e backups antes de gravar.
7. Testar migrações, consultas de período, pagamentos parciais e restauração.

## Limites

- Não criar componentes de UI ou CSS.
- Não criar endpoints, Workers ou sincronização em nuvem.
- Não enviar dados comerciais para serviços externos.
- Não usar SQL, `localStorage` como banco ou cálculos monetários com ponto
  flutuante.
- Entregar dados e erros tipados para a camada de interface.

