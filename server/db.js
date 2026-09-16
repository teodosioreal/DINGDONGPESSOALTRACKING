import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "dingdong.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  gclid TEXT,
  fbclid TEXT,
  origem TEXT NOT NULL DEFAULT 'sem_rastreio',
  url_origem TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clicks_codigo ON clicks(codigo);

CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL UNIQUE,
  nome TEXT,
  gclid TEXT,
  fbclid TEXT,
  origem TEXT NOT NULL DEFAULT 'sem_rastreio',
  status TEXT NOT NULL DEFAULT 'lead',
  valor REAL,
  conversao_enviada INTEGER NOT NULL DEFAULT 0,
  conversao_resposta TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  de_mim INTEGER NOT NULL DEFAULT 0,
  texto TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id);
`);

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
