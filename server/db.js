import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "dingdong.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function criarSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    webhook_secret TEXT NOT NULL UNIQUE,
    palavras_chave TEXT NOT NULL DEFAULT '',
    confirmar_antes_de_enviar INTEGER NOT NULL DEFAULT 1,
    moeda TEXT NOT NULL DEFAULT 'BRL',
    bloqueio_auto_ativo INTEGER NOT NULL DEFAULT 1,
    bloqueio_auto_cliques INTEGER NOT NULL DEFAULT 5,
    bloqueio_auto_minutos INTEGER NOT NULL DEFAULT 5,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS google_conexoes (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    refresh_token TEXT,
    email TEXT,
    customer_id TEXT,
    customer_nome TEXT,
    login_customer_id TEXT
  );

  CREATE TABLE IF NOT EXISTS whatsapp_conexoes (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    session_id TEXT,
    api_key TEXT
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    codigo TEXT UNIQUE NOT NULL,
    gclid TEXT,
    fbclid TEXT,
    origem TEXT NOT NULL DEFAULT 'sem_rastreio',
    url_origem TEXT,
    ip TEXT,
    duracao_segundos INTEGER,
    campanha TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_clicks_codigo ON clicks(codigo);
  CREATE INDEX IF NOT EXISTS idx_clicks_empresa ON clicks(empresa_id);

  CREATE TABLE IF NOT EXISTS conversas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    telefone TEXT NOT NULL,
    nome TEXT,
    gclid TEXT,
    fbclid TEXT,
    ip TEXT,
    campanha TEXT,
    origem TEXT NOT NULL DEFAULT 'sem_rastreio',
    status TEXT NOT NULL DEFAULT 'lead',
    valor_sugerido REAL,
    valor REAL,
    conversao_enviada INTEGER NOT NULL DEFAULT 0,
    conversao_resposta TEXT,
    fila_status TEXT,
    envio_agendado_para TEXT,
    fila_tentativas INTEGER NOT NULL DEFAULT 0,
    nao_lida INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_empresa_telefone ON conversas(empresa_id, telefone);

  CREATE TABLE IF NOT EXISTS ips_bloqueados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    motivo TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ips_bloqueados_empresa_ip ON ips_bloqueados(empresa_id, ip);

  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    de_mim INTEGER NOT NULL DEFAULT 0,
    texto TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id);
  `);
}

function colunaExiste(tabela, coluna) {
  return db
    .prepare(`PRAGMA table_info(${tabela})`)
    .all()
    .some((c) => c.name === coluna);
}

function tabelaExiste(nome) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome));
}

/**
 * O app começou single-tenant (uma conexão Google/WhatsApp só, guardada na
 * tabela `config`) e virou multi-empresa depois. Se o banco ainda estiver no
 * formato antigo, migra automaticamente: recria as tabelas dependentes de
 * empresa e preserva as conexões antigas numa empresa "Minha Empresa".
 */
function migrarParaMultiEmpresa() {
  const precisaMigrar = tabelaExiste("conversas") && !colunaExiste("conversas", "empresa_id");
  if (!precisaMigrar) return;

  console.log("[migracao] Banco no formato antigo (single-tenant) — migrando para multi-empresa...");

  const configAntiga = {};
  if (tabelaExiste("config")) {
    for (const l of db.prepare("SELECT chave, valor FROM config").all()) configAntiga[l.chave] = l.valor;
  }

  db.exec(`
    DROP TABLE IF EXISTS mensagens;
    DROP TABLE IF EXISTS conversas;
    DROP TABLE IF EXISTS clicks;
    DROP TABLE IF EXISTS config;
  `);

  criarSchema();

  const temGoogle = Boolean(configAntiga.google_refresh_token);
  const temWhatsapp = Boolean(configAntiga.dapi_session_id);
  if (temGoogle || temWhatsapp) {
    const empresaId = criarEmpresa({ nome: "Minha Empresa" }).id;
    if (temGoogle) {
      db.prepare(
        `INSERT INTO google_conexoes (empresa_id, refresh_token, email, customer_id, customer_nome, login_customer_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        empresaId,
        configAntiga.google_refresh_token,
        configAntiga.google_email ?? null,
        configAntiga.google_customer_id ?? null,
        configAntiga.google_customer_nome ?? null,
        configAntiga.google_login_customer_id ?? null,
      );
    }
    if (temWhatsapp) {
      db.prepare("INSERT INTO whatsapp_conexoes (empresa_id, session_id, api_key) VALUES (?, ?, ?)").run(
        empresaId,
        configAntiga.dapi_session_id,
        configAntiga.dapi_api_key ?? null,
      );
    }
    console.log(`[migracao] Conexões antigas preservadas em "Minha Empresa" (empresa #${empresaId}).`);
  }
}

function adicionarColuna(tabela, coluna, definicao) {
  if (!colunaExiste(tabela, coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

/**
 * Colunas novas adicionadas depois que as tabelas já existiam em produção.
 * Roda DEPOIS do criarSchema() — índices que dependem dessas colunas também
 * ficam aqui (não em criarSchema), porque criarSchema() usa CREATE TABLE IF
 * NOT EXISTS: numa tabela `clicks`/`conversas` já existente sem a coluna
 * `ip`, um CREATE INDEX ... ON clicks(ip) ali quebraria com SQLITE_ERROR.
 */
function migrarColunasNovas() {
  if (!tabelaExiste("clicks") || !tabelaExiste("conversas")) return;
  adicionarColuna("clicks", "ip", "TEXT");
  adicionarColuna("clicks", "duracao_segundos", "INTEGER");
  adicionarColuna("clicks", "campanha", "TEXT");
  adicionarColuna("conversas", "ip", "TEXT");
  adicionarColuna("conversas", "campanha", "TEXT");
  adicionarColuna("conversas", "fila_status", "TEXT");
  adicionarColuna("conversas", "envio_agendado_para", "TEXT");
  adicionarColuna("conversas", "fila_tentativas", "INTEGER NOT NULL DEFAULT 0");
  adicionarColuna("conversas", "nao_lida", "INTEGER NOT NULL DEFAULT 0");
  adicionarColuna("empresas", "bloqueio_auto_ativo", "INTEGER NOT NULL DEFAULT 1");
  adicionarColuna("empresas", "bloqueio_auto_cliques", "INTEGER NOT NULL DEFAULT 5");
  adicionarColuna("empresas", "bloqueio_auto_minutos", "INTEGER NOT NULL DEFAULT 5");
  adicionarColuna("ips_bloqueados", "motivo", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_clicks_empresa_ip ON clicks(empresa_id, ip);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_conversas_fila_status ON conversas(fila_status, envio_agendado_para);");
}

// A migração precisa rodar ANTES do criarSchema() definitivo: se o banco
// ainda estiver no formato antigo, criar o índice novo (empresa_id) em cima
// da tabela `conversas` antiga (sem essa coluna) quebraria com SQLITE_ERROR.
migrarParaMultiEmpresa();
criarSchema();
migrarColunasNovas();

/* ------------------------------------------------------------- empresas */

function gerarSegredo() {
  return randomBytes(16).toString("hex");
}

export function criarEmpresa({ nome }) {
  const info = db
    .prepare("INSERT INTO empresas (nome, webhook_secret) VALUES (?, ?)")
    .run(String(nome ?? "").trim() || "Empresa sem nome", gerarSegredo());
  return buscarEmpresa(info.lastInsertRowid);
}

export function listarEmpresas() {
  return db
    .prepare(
      `SELECT e.*,
              (g.refresh_token IS NOT NULL AND g.customer_id IS NOT NULL) AS googleConectado,
              (w.session_id IS NOT NULL AND w.api_key IS NOT NULL) AS whatsappConfigurado,
              (e.palavras_chave IS NOT NULL AND TRIM(e.palavras_chave) != '') AS regrasConfiguradas,
              EXISTS(SELECT 1 FROM clicks c WHERE c.empresa_id = e.id) AS pixelInstalado
       FROM empresas e
       LEFT JOIN google_conexoes g ON g.empresa_id = e.id
       LEFT JOIN whatsapp_conexoes w ON w.empresa_id = e.id
       ORDER BY e.nome COLLATE NOCASE`,
    )
    .all();
}

export function buscarEmpresa(id) {
  return db.prepare("SELECT * FROM empresas WHERE id = ?").get(id) ?? null;
}

export function buscarEmpresaPorWebhookSecret(id, segredo) {
  return (
    db.prepare("SELECT * FROM empresas WHERE id = ? AND webhook_secret = ?").get(id, segredo) ?? null
  );
}

export function atualizarRegrasVenda(empresaId, { palavrasChave, confirmarAntesDeEnviar }) {
  db.prepare("UPDATE empresas SET palavras_chave = ?, confirmar_antes_de_enviar = ? WHERE id = ?").run(
    String(palavrasChave ?? ""),
    confirmarAntesDeEnviar ? 1 : 0,
    empresaId,
  );
}

export function apagarEmpresa(id) {
  db.prepare("DELETE FROM empresas WHERE id = ?").run(id);
}

/* ----------------------------------------------------------- bloqueio de IP */

export function bloquearIp(empresaId, ip, motivo = null) {
  db.prepare("INSERT OR IGNORE INTO ips_bloqueados (empresa_id, ip, motivo) VALUES (?, ?, ?)").run(
    empresaId,
    ip,
    motivo,
  );
}

export function desbloquearIp(empresaId, ip) {
  db.prepare("DELETE FROM ips_bloqueados WHERE empresa_id = ? AND ip = ?").run(empresaId, ip);
}

export function listarIpsBloqueados(empresaId) {
  return db.prepare("SELECT * FROM ips_bloqueados WHERE empresa_id = ? ORDER BY criado_em DESC").all(empresaId);
}

export function ipEstaBloqueado(empresaId, ip) {
  if (!ip) return false;
  return Boolean(db.prepare("SELECT 1 FROM ips_bloqueados WHERE empresa_id = ? AND ip = ?").get(empresaId, ip));
}

/** Quantos cliques vindos de anúncio (gclid/fbclid) esse IP fez nos últimos N minutos, nessa empresa. */
export function contarCliquesRecentesDoIp(empresaId, ip, minutos) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM clicks
       WHERE empresa_id = ? AND ip = ? AND origem != 'sem_rastreio' AND criado_em >= datetime('now', ?)`,
    )
    .get(empresaId, ip, `-${minutos} minutes`).n;
}

export function atualizarConfigBloqueioAuto(empresaId, { ativo, cliques, minutos }) {
  db.prepare(
    "UPDATE empresas SET bloqueio_auto_ativo = ?, bloqueio_auto_cliques = ?, bloqueio_auto_minutos = ? WHERE id = ?",
  ).run(ativo ? 1 : 0, cliques, minutos, empresaId);
}

/** Visitas agrupadas por IP (mais recentes primeiro), pra tela de Bloqueio de IP. */
export function listarVisitasPorIp(empresaId) {
  return db
    .prepare(
      `SELECT ip,
              COUNT(*) AS visitas,
              MAX(criado_em) AS ultima_visita,
              MAX(duracao_segundos) AS duracao_segundos,
              MAX(CASE WHEN origem != 'sem_rastreio' THEN 1 ELSE 0 END) AS veioDeAnuncio
       FROM clicks
       WHERE empresa_id = ? AND ip IS NOT NULL AND ip != ''
       GROUP BY ip
       ORDER BY ultima_visita DESC
       LIMIT 200`,
    )
    .all(empresaId);
}

/* --------------------------------------------------------- fila de envio */

/** Vendas dessa empresa esperando o envio automático (pra tela "Vendas para Envio"). */
export function listarFilaDeEnvio(empresaId) {
  return db
    .prepare(
      `SELECT * FROM conversas WHERE empresa_id = ? AND fila_status = 'pendente' ORDER BY envio_agendado_para ASC`,
    )
    .all(empresaId);
}

/** Vendas de QUALQUER empresa já no horário de serem enviadas — usado pelo agendador. */
export function listarFilaDeEnvioDevida() {
  return db
    .prepare(`SELECT * FROM conversas WHERE fila_status = 'pendente' AND envio_agendado_para <= datetime('now')`)
    .all();
}

/** Registra o resultado de uma tentativa de envio. Falha mantém "pendente" pra tentar de novo depois. */
export function marcarEnvioResultado(conversaId, { enviada, resposta }) {
  db.prepare(
    `UPDATE conversas
     SET fila_status = ?, conversao_enviada = ?, conversao_resposta = ?, fila_tentativas = fila_tentativas + 1, atualizado_em = datetime('now')
     WHERE id = ?`,
  ).run(enviada ? "enviado" : "pendente", enviada ? 1 : 0, resposta, conversaId);
}

export function cancelarEnvioNaFila(conversaId) {
  db.prepare(
    `UPDATE conversas SET fila_status = 'cancelado', conversao_resposta = 'Envio cancelado manualmente.', atualizado_em = datetime('now') WHERE id = ?`,
  ).run(conversaId);
}

/* ------------------------------------------------------------ conversas */

export function marcarConversaLida(conversaId) {
  db.prepare("UPDATE conversas SET nao_lida = 0 WHERE id = ?").run(conversaId);
}

export function contarConversasNaoLidas(empresaId) {
  return db.prepare("SELECT COUNT(*) AS n FROM conversas WHERE empresa_id = ? AND nao_lida = 1").get(empresaId).n;
}

/** Resumo de quanto do setup da empresa já está pronto — pra tela Painel. */
export function checklistSetup(empresaId) {
  const empresa = db.prepare("SELECT palavras_chave FROM empresas WHERE id = ?").get(empresaId);
  const google = db.prepare("SELECT refresh_token, customer_id FROM google_conexoes WHERE empresa_id = ?").get(empresaId);
  const whatsapp = db.prepare("SELECT session_id, api_key FROM whatsapp_conexoes WHERE empresa_id = ?").get(empresaId);
  const ultimoClique = db.prepare("SELECT MAX(criado_em) AS quando FROM clicks WHERE empresa_id = ?").get(empresaId);
  return {
    googleConectado: Boolean(google?.refresh_token && google?.customer_id),
    whatsappConfigurado: Boolean(whatsapp?.session_id && whatsapp?.api_key),
    regrasConfiguradas: Boolean(empresa?.palavras_chave?.trim()),
    ultimoCliqueEm: ultimoClique?.quando ?? null,
  };
}

/* -------------------------------------------------------- config global */

export function getConfig(chave) {
  const row = db.prepare("SELECT valor FROM config WHERE chave = ?").get(chave);
  return row?.valor ?? null;
}

export function setConfig(chave, valor) {
  db.prepare(
    "INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).run(chave, valor);
}

export function apagarConfig(chave) {
  db.prepare("DELETE FROM config WHERE chave = ?").run(chave);
}
