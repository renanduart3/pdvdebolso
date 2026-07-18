/**
 * Caderno Digital do Autônomo — Camada de dados (IndexedDB)
 *
 * Filosofia: TUDO fica no navegador do usuário. Nenhum dado de cliente,
 * produto ou venda passa pelo seu servidor. Isso é o argumento de venda
 * de privacidade e também o motivo do custo de infra ser zero.
 *
 * Sem dependências externas — IndexedDB nativo, sem precisar de build step
 * pra rodar num Cloudflare Pages puramente estático.
 */

const DB_NAME = 'caderno-autonomo';
const DB_VERSION = 1;

const STORES = {
  clientes: 'clientes',
  produtos: 'produtos',
  vendas: 'vendas',
  pagamentosFiado: 'pagamentos_fiado',
  config: 'config', // guarda { chave: 'ads_removed', valor: true/false } e o token de pagamento
};

/**
 * Abre (e migra, se necessário) o banco.
 * Chame isso uma vez no boot do app e reaproveite a conexão.
 */
function abrirBanco() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.clientes)) {
        const clientes = db.createObjectStore(STORES.clientes, { keyPath: 'id' });
        clientes.createIndex('nome', 'nome', { unique: false });
        clientes.createIndex('telefone', 'telefone', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.produtos)) {
        const produtos = db.createObjectStore(STORES.produtos, { keyPath: 'id' });
        produtos.createIndex('nome', 'nome', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.vendas)) {
        const vendas = db.createObjectStore(STORES.vendas, { keyPath: 'id' });
        vendas.createIndex('clienteId', 'clienteId', { unique: false });
        vendas.createIndex('status', 'status', { unique: false }); // 'pago' | 'pendente'
        vendas.createIndex('data', 'data', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.pagamentosFiado)) {
        const pagamentos = db.createObjectStore(STORES.pagamentosFiado, { keyPath: 'id' });
        pagamentos.createIndex('vendaId', 'vendaId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'chave' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Helpers genéricos de transação ----------

function tx(db, storeName, modo = 'readonly') {
  return db.transaction(storeName, modo).objectStore(storeName);
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  return crypto.randomUUID();
}

// ---------- Clientes ----------

async function salvarCliente(db, { nome, telefone, fotoBlob = null }) {
  const cliente = {
    id: uuid(),
    nome,
    telefone,
    fotoBlob, // Blob pequeno pode ir direto no IndexedDB; fotos grandes -> ver nota OPFS abaixo
    criadoEm: new Date().toISOString(),
  };
  await promisifyRequest(tx(db, STORES.clientes, 'readwrite').add(cliente));
  return cliente;
}

async function listarClientes(db) {
  return promisifyRequest(tx(db, STORES.clientes).getAll());
}

// ---------- Produtos ----------

async function salvarProduto(db, { nome, preco, custo = null }) {
  const produto = {
    id: uuid(),
    nome,
    preco,
    custo, // opcional — usado pra calcular margem no relatório
    criadoEm: new Date().toISOString(),
  };
  await promisifyRequest(tx(db, STORES.produtos, 'readwrite').add(produto));
  return produto;
}

async function listarProdutos(db) {
  return promisifyRequest(tx(db, STORES.produtos).getAll());
}

// ---------- Vendas ----------

/**
 * itens: [{ produtoId, nome, precoUnitario, quantidade }]
 * tipo: 'avista' | 'fiado'
 */
async function registrarVenda(db, { clienteId = null, itens, tipo }) {
  const total = itens.reduce((soma, item) => soma + item.precoUnitario * item.quantidade, 0);

  const venda = {
    id: uuid(),
    clienteId,
    itens,
    total,
    tipo,
    status: tipo === 'avista' ? 'pago' : 'pendente',
    data: new Date().toISOString(),
    pagoEm: tipo === 'avista' ? new Date().toISOString() : null,
  };

  await promisifyRequest(tx(db, STORES.vendas, 'readwrite').add(venda));
  return venda;
}

async function listarVendasPorPeriodo(db, dataInicio, dataFim) {
  const todas = await promisifyRequest(tx(db, STORES.vendas).getAll());
  return todas.filter((v) => v.data >= dataInicio && v.data <= dataFim);
}

async function listarFiadoPendentePorCliente(db, clienteId) {
  const todas = await promisifyRequest(tx(db, STORES.vendas).getAll());
  return todas.filter((v) => v.clienteId === clienteId && v.status === 'pendente');
}

/** Registra pagamento parcial ou total de uma venda fiado */
async function registrarPagamentoFiado(db, { vendaId, valor }) {
  const storeVendas = tx(db, STORES.vendas, 'readwrite');
  const venda = await promisifyRequest(storeVendas.get(vendaId));
  if (!venda) throw new Error('Venda não encontrada');

  const pagamento = { id: uuid(), vendaId, valor, data: new Date().toISOString() };
  await promisifyRequest(tx(db, STORES.pagamentosFiado, 'readwrite').add(pagamento));

  const pagamentosAnteriores = (
    await promisifyRequest(tx(db, STORES.pagamentosFiado).index('vendaId').getAll(vendaId))
  ).reduce((soma, p) => soma + p.valor, 0);

  if (pagamentosAnteriores >= venda.total) {
    venda.status = 'pago';
    venda.pagoEm = new Date().toISOString();
    await promisifyRequest(storeVendas.put(venda));
  }

  return pagamento;
}

// ---------- Config / flag de pagamento ($1 remove ads) ----------

async function salvarConfig(db, chave, valor) {
  await promisifyRequest(tx(db, STORES.config, 'readwrite').put({ chave, valor }));
}

async function lerConfig(db, chave) {
  const registro = await promisifyRequest(tx(db, STORES.config).get(chave));
  return registro ? registro.valor : null;
}

async function adsRemovidos(db) {
  return (await lerConfig(db, 'ads_removed')) === true;
}

// ---------- Backup manual (export/import .json) ----------
// Resolve 80% da ansiedade de "troquei de celular e perdi tudo" sem precisar
// de servidor com banco de dados.

async function exportarBackup(db) {
  const [clientes, produtos, vendas, pagamentos] = await Promise.all([
    promisifyRequest(tx(db, STORES.clientes).getAll()),
    promisifyRequest(tx(db, STORES.produtos).getAll()),
    promisifyRequest(tx(db, STORES.vendas).getAll()),
    promisifyRequest(tx(db, STORES.pagamentosFiado).getAll()),
  ]);

  const backup = {
    versao: DB_VERSION,
    exportadoEm: new Date().toISOString(),
    clientes,
    produtos,
    vendas,
    pagamentosFiado: pagamentos,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-caderno-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importarBackup(db, arquivoJson) {
  const texto = await arquivoJson.text();
  const backup = JSON.parse(texto);

  const gravarTodos = async (storeName, registros) => {
    const store = tx(db, storeName, 'readwrite');
    for (const registro of registros) {
      await promisifyRequest(store.put(registro)); // put = sobrescreve se já existir (idempotente)
    }
  };

  await gravarTodos(STORES.clientes, backup.clientes || []);
  await gravarTodos(STORES.produtos, backup.produtos || []);
  await gravarTodos(STORES.vendas, backup.vendas || []);
  await gravarTodos(STORES.pagamentosFiado, backup.pagamentosFiado || []);
}

export {
  abrirBanco,
  salvarCliente,
  listarClientes,
  salvarProduto,
  listarProdutos,
  registrarVenda,
  listarVendasPorPeriodo,
  listarFiadoPendentePorCliente,
  registrarPagamentoFiado,
  salvarConfig,
  lerConfig,
  adsRemovidos,
  exportarBackup,
  importarBackup,
};
