import { db } from "./db.js";
import { buscarCliquePorCodigo, extrairCodigoDoTexto } from "./tracking.js";

/** Garante que existe uma conversa para o telefone e devolve a linha. */
function conversaDoTelefone(telefone, nome) {
  const existente = db.prepare("SELECT * FROM conversas WHERE telefone = ?").get(telefone);
  if (existente) return existente;
  const info = db
    .prepare("INSERT INTO conversas (telefone, nome) VALUES (?, ?)")
    .run(telefone, nome ?? null);
  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(info.lastInsertRowid);
}

/**
 * Processa uma mensagem recebida: cria/atualiza a conversa, tenta achar o
 * código de rastreio na primeira mensagem (vindo do link do WhatsApp) e
 * grava o histórico.
 */
export function registrarMensagemRecebida({ telefone, texto, nome }) {
  const conversa = conversaDoTelefone(telefone, nome);

  const codigo = extrairCodigoDoTexto(texto);
  if (codigo && conversa.origem === "sem_rastreio") {
    const clique = buscarCliquePorCodigo(codigo);
    if (clique) {
      db.prepare(
        "UPDATE conversas SET gclid = ?, fbclid = ?, origem = ?, atualizado_em = datetime('now') WHERE id = ?",
      ).run(clique.gclid, clique.fbclid, clique.origem, conversa.id);
    }
  }

  db.prepare("INSERT INTO mensagens (conversa_id, de_mim, texto) VALUES (?, 0, ?)").run(conversa.id, texto);
  db.prepare("UPDATE conversas SET atualizado_em = datetime('now') WHERE id = ?").run(conversa.id);

  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(conversa.id);
}

export function registrarMensagemEnviada({ telefone, texto }) {
  const conversa = conversaDoTelefone(telefone);
  db.prepare("INSERT INTO mensagens (conversa_id, de_mim, texto) VALUES (?, 1, ?)").run(conversa.id, texto);
}

export function listarConversas() {
  return db.prepare("SELECT * FROM conversas ORDER BY atualizado_em DESC LIMIT 200").all();
}

export function buscarConversa(id) {
  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(id) ?? null;
}

export function listarMensagens(conversaId) {
  return db
    .prepare("SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY criado_em ASC")
    .all(conversaId);
}

export function marcarVenda(id, { valor, conversaoEnviada, respostaConversao }) {
  db.prepare(
    `UPDATE conversas
     SET status = 'vendido', valor = ?, conversao_enviada = ?, conversao_resposta = ?, atualizado_em = datetime('now')
     WHERE id = ?`,
  ).run(valor, conversaoEnviada ? 1 : 0, respostaConversao ?? null, id);
}

export function resumoDashboard() {
  const hoje = db
    .prepare(
      `SELECT COUNT(*) AS leadsHoje FROM conversas WHERE date(criado_em) = date('now')`,
    )
    .get();
  const vendas = db
    .prepare(`SELECT COUNT(*) AS totalVendas, COALESCE(SUM(valor), 0) AS receita FROM conversas WHERE status = 'vendido'`)
    .get();
  const porOrigem = db
    .prepare(
      `SELECT origem,
              COUNT(*) AS leads,
              SUM(CASE WHEN status = 'vendido' THEN 1 ELSE 0 END) AS vendas,
              COALESCE(SUM(CASE WHEN status = 'vendido' THEN valor ELSE 0 END), 0) AS receita
       FROM conversas GROUP BY origem`,
    )
    .all();
  return { leadsHoje: hoje.leadsHoje, totalVendas: vendas.totalVendas, receita: vendas.receita, porOrigem };
}
