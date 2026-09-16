import { db, ipEstaBloqueado } from "./db.js";
import { buscarCliquePorCodigo, extrairCodigoDoTexto } from "./tracking.js";
import { avaliarMensagem } from "./vendaAutomatica.js";
import { enviarConversaoGoogle } from "./googleAds.js";

/** Garante que existe uma conversa para o telefone (dentro da empresa) e devolve a linha. */
function conversaDoTelefone(empresaId, telefone, nome) {
  const existente = db
    .prepare("SELECT * FROM conversas WHERE empresa_id = ? AND telefone = ?")
    .get(empresaId, telefone);
  if (existente) return existente;
  const info = db
    .prepare("INSERT INTO conversas (empresa_id, telefone, nome) VALUES (?, ?, ?)")
    .run(empresaId, telefone, nome ?? null);
  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(info.lastInsertRowid);
}

/**
 * Processa uma mensagem recebida: cria/atualiza a conversa, tenta achar o
 * código de rastreio na primeira mensagem (vindo do link do WhatsApp),
 * grava o histórico e roda a detecção de venda por palavra-chave.
 */
export async function registrarMensagemRecebida(empresa, { telefone, texto, nome }) {
  const empresaId = empresa.id;
  let conversa = conversaDoTelefone(empresaId, telefone, nome);

  const codigo = extrairCodigoDoTexto(texto);
  if (codigo && conversa.origem === "sem_rastreio") {
    const clique = buscarCliquePorCodigo(codigo);
    if (clique) {
      db.prepare(
        "UPDATE conversas SET gclid = ?, fbclid = ?, origem = ?, ip = ?, atualizado_em = datetime('now') WHERE id = ?",
      ).run(clique.gclid, clique.fbclid, clique.origem, clique.ip, conversa.id);
    }
  }

  db.prepare("INSERT INTO mensagens (conversa_id, de_mim, texto) VALUES (?, 0, ?)").run(conversa.id, texto);
  db.prepare("UPDATE conversas SET atualizado_em = datetime('now') WHERE id = ?").run(conversa.id);
  conversa = db.prepare("SELECT * FROM conversas WHERE id = ?").get(conversa.id);

  if (conversa.status === "lead") {
    const avaliacao = avaliarMensagem(texto, empresa);
    if (avaliacao.detectado) {
      if (!empresa.confirmar_antes_de_enviar && avaliacao.valor) {
        await confirmarVenda(empresa, conversa, avaliacao.valor);
      } else {
        db.prepare(
          "UPDATE conversas SET status = 'venda_provavel', valor_sugerido = ?, atualizado_em = datetime('now') WHERE id = ?",
        ).run(avaliacao.valor, conversa.id);
      }
    }
  }

  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(conversa.id);
}

export function registrarMensagemEnviada(empresaId, { telefone, texto }) {
  const conversa = conversaDoTelefone(empresaId, telefone);
  db.prepare("INSERT INTO mensagens (conversa_id, de_mim, texto) VALUES (?, 1, ?)").run(conversa.id, texto);
}

export function listarConversas(empresaId) {
  return db
    .prepare("SELECT * FROM conversas WHERE empresa_id = ? ORDER BY atualizado_em DESC LIMIT 200")
    .all(empresaId);
}

export function buscarConversa(empresaId, id) {
  return db.prepare("SELECT * FROM conversas WHERE id = ? AND empresa_id = ?").get(id, empresaId) ?? null;
}

export function listarMensagens(conversaId) {
  return db.prepare("SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY criado_em ASC").all(conversaId);
}

/** Marca a venda e, se houver gclid, envia a conversão pro Google Ads da empresa. */
export async function confirmarVenda(empresa, conversa, valor) {
  let conversaoEnviada = false;
  let respostaConversao = null;
  if (conversa.ip && ipEstaBloqueado(empresa.id, conversa.ip)) {
    respostaConversao = `Venda marcada, mas a conversão NÃO foi enviada: o IP ${conversa.ip} está bloqueado.`;
  } else if (conversa.gclid) {
    const r = await enviarConversaoGoogle(empresa.id, { gclid: conversa.gclid, valor, moeda: empresa.moeda });
    conversaoEnviada = r.ok;
    respostaConversao = r.ok ? "Conversão enviada ao Google Ads." : r.erro;
  } else {
    respostaConversao = "Sem gclid nesta conversa — venda marcada, mas nada foi enviado ao Google Ads.";
  }

  db.prepare(
    `UPDATE conversas
     SET status = 'vendido', valor = ?, valor_sugerido = NULL, conversao_enviada = ?, conversao_resposta = ?, atualizado_em = datetime('now')
     WHERE id = ?`,
  ).run(valor, conversaoEnviada ? 1 : 0, respostaConversao, conversa.id);

  return { conversaoEnviada, respostaConversao };
}

/** Descarta uma "venda provável" detectada por engano, voltando a conversa pra lead. */
export function descartarVendaProvavel(conversaId) {
  db.prepare(
    "UPDATE conversas SET status = 'lead', valor_sugerido = NULL, atualizado_em = datetime('now') WHERE id = ?",
  ).run(conversaId);
}

export function resumoDashboard(empresaId) {
  const hoje = db
    .prepare(`SELECT COUNT(*) AS leadsHoje FROM conversas WHERE empresa_id = ? AND date(criado_em) = date('now')`)
    .get(empresaId);
  const vendas = db
    .prepare(
      `SELECT COUNT(*) AS totalVendas, COALESCE(SUM(valor), 0) AS receita
       FROM conversas WHERE empresa_id = ? AND status = 'vendido'`,
    )
    .get(empresaId);
  const pendentes = db
    .prepare(`SELECT COUNT(*) AS total FROM conversas WHERE empresa_id = ? AND status = 'venda_provavel'`)
    .get(empresaId);
  const porOrigem = db
    .prepare(
      `SELECT origem,
              COUNT(*) AS leads,
              SUM(CASE WHEN status = 'vendido' THEN 1 ELSE 0 END) AS vendas,
              COALESCE(SUM(CASE WHEN status = 'vendido' THEN valor ELSE 0 END), 0) AS receita
       FROM conversas WHERE empresa_id = ? GROUP BY origem`,
    )
    .all(empresaId);
  return {
    leadsHoje: hoje.leadsHoje,
    totalVendas: vendas.totalVendas,
    receita: vendas.receita,
    vendasProvaveisPendentes: pendentes.total,
    porOrigem,
  };
}
