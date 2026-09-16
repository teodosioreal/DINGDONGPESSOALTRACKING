import { db, ipEstaBloqueado, cancelarEnvioNaFila, listarFilaDeEnvio } from "./db.js";
import { buscarCliquePorCodigo, extrairCodigoDoTexto } from "./tracking.js";
import { avaliarMensagem } from "./vendaAutomatica.js";
import { proximoHorarioEnvio, formatarHorarioBrasilia, enviarVendaParaGoogleAds } from "./filaDeEnvio.js";

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
        "UPDATE conversas SET gclid = ?, fbclid = ?, origem = ?, ip = ?, campanha = ?, atualizado_em = datetime('now') WHERE id = ?",
      ).run(clique.gclid, clique.fbclid, clique.origem, clique.ip, clique.campanha, conversa.id);
    }
  }

  db.prepare("INSERT INTO mensagens (conversa_id, de_mim, texto) VALUES (?, 0, ?)").run(conversa.id, texto);
  db.prepare("UPDATE conversas SET nao_lida = 1, atualizado_em = datetime('now') WHERE id = ?").run(conversa.id);

  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(conversa.id);
}

/** Evita registrar/detectar a mesma mensagem enviada duas vezes (ex: eco do webhook de uma mensagem que a gente mesma já mandou pelo painel). */
function mensagemEnviadaDuplicadaRecente(conversaId, texto) {
  return Boolean(
    db
      .prepare(
        `SELECT id FROM mensagens
         WHERE conversa_id = ? AND de_mim = 1 AND texto = ? AND criado_em >= datetime('now', '-15 seconds')
         ORDER BY id DESC LIMIT 1`,
      )
      .get(conversaId, texto),
  );
}

/**
 * Processa uma mensagem ENVIADA pela empresa pro cliente (pelo painel ou
 * direto do celular conectado) — a detecção de venda por palavra-chave roda
 * aqui: é a frase que a empresa manda pra confirmar a venda (ex: "pagamento
 * confirmado") que dispara, não o que o cliente escreve.
 */
export async function registrarMensagemEnviada(empresa, { telefone, texto, nome }) {
  const empresaId = empresa.id;
  let conversa = conversaDoTelefone(empresaId, telefone, nome);

  if (mensagemEnviadaDuplicadaRecente(conversa.id, texto)) {
    return conversa;
  }

  db.prepare("INSERT INTO mensagens (conversa_id, de_mim, texto) VALUES (?, 1, ?)").run(conversa.id, texto);
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

/**
 * Marca a venda. Se houver gclid (e o IP não estiver bloqueado), a conversão
 * NÃO é enviada na hora — entra na fila e é enviada automaticamente às 08h
 * ou 20h (horário de Brasília), a não ser que o usuário mande antes ou
 * cancele em "Vendas para Envio".
 */
export async function confirmarVenda(empresa, conversa, valor) {
  let filaStatus = null;
  let envioAgendadoPara = null;
  let respostaConversao;

  if (conversa.ip && ipEstaBloqueado(empresa.id, conversa.ip)) {
    respostaConversao = `Venda marcada, mas a conversão NÃO foi enviada: o IP ${conversa.ip} está bloqueado.`;
  } else if (conversa.gclid) {
    filaStatus = "pendente";
    envioAgendadoPara = proximoHorarioEnvio().toISOString();
    respostaConversao = `Venda marcada — a conversão entra na fila e é enviada automaticamente às ${formatarHorarioBrasilia(envioAgendadoPara)}. Você pode mandar antes ou cancelar em "Vendas para Envio".`;
  } else {
    respostaConversao = "Sem gclid nesta conversa — venda marcada, mas nada foi enviado ao Google Ads.";
  }

  db.prepare(
    `UPDATE conversas
     SET status = 'vendido', valor = ?, valor_sugerido = NULL, conversao_enviada = 0, conversao_resposta = ?,
         fila_status = ?, envio_agendado_para = ?, atualizado_em = datetime('now')
     WHERE id = ?`,
  ).run(valor, respostaConversao, filaStatus, envioAgendadoPara, conversa.id);

  return { conversaoEnviada: false, respostaConversao };
}

/** Vendas dessa empresa esperando na fila de envio, formatadas pra tela "Vendas para Envio". */
export function listarFila(empresaId) {
  return listarFilaDeEnvio(empresaId).map((c) => ({
    id: c.id,
    nome: c.nome,
    telefone: c.telefone,
    valor: c.valor,
    campanha: c.campanha,
    envioAgendadoPara: c.envio_agendado_para,
    // Se já tentou pelo menos uma vez e continua pendente, foi porque falhou —
    // conversao_resposta guarda o erro dessa última tentativa.
    ultimoErro: c.fila_tentativas > 0 ? c.conversao_resposta : null,
  }));
}

/** Envia uma venda da fila na hora, sem esperar o horário agendado. */
export async function enviarVendaAgora(conversa) {
  if (conversa.fila_status !== "pendente") {
    return { ok: false, erro: "Essa venda não está na fila de envio." };
  }
  return enviarVendaParaGoogleAds(conversa);
}

/** Cancela o envio de uma venda da fila — a conversão nunca é mandada pro Google Ads. */
export function cancelarEnvio(conversa) {
  if (conversa.fila_status !== "pendente") {
    return { ok: false, erro: "Essa venda não está na fila de envio." };
  }
  cancelarEnvioNaFila(conversa.id);
  return { ok: true };
}

/** Descarta uma "venda provável" detectada por engano, voltando a conversa pra lead. */
export function descartarVendaProvavel(conversaId) {
  db.prepare(
    "UPDATE conversas SET status = 'lead', valor_sugerido = NULL, atualizado_em = datetime('now') WHERE id = ?",
  ).run(conversaId);
}

export function resumoDashboard(empresaId) {
  const empresa = db.prepare("SELECT moeda FROM empresas WHERE id = ?").get(empresaId);
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
    moeda: empresa?.moeda ?? "BRL",
  };
}

/**
 * Eventos recentes de uma empresa, pra alimentar o sininho de notificações no
 * frontend (palavra-chave detectada, venda enviada ao Google Ads). `desde` é
 * opcional — sem ele, devolve a lista vazia e só serve pra pegar o "agora" do
 * servidor (usado pelo frontend pra "primar" o polling sem disparar
 * notificação de coisa antiga).
 */
export function eventosRecentes(empresaId, desde) {
  const agora = db.prepare("SELECT datetime('now') AS agora").get().agora;
  if (!desde) return { eventos: [], agora };

  // >= (não >): datetime('now') do SQLite só tem resolução de 1 segundo, então
  // um evento no mesmo segundo do "desde" com > ficaria de fora pra sempre.
  // Prefiro arriscar mostrar uma notificação duplicada (inofensiva) a
  // perder uma silenciosamente.
  const provaveis = db
    .prepare(
      `SELECT nome, telefone, valor_sugerido AS valor, atualizado_em AS quando
       FROM conversas
       WHERE empresa_id = ? AND status = 'venda_provavel' AND atualizado_em >= ?
       ORDER BY atualizado_em ASC LIMIT 30`,
    )
    .all(empresaId, desde)
    .map((r) => ({ tipo: "venda_provavel", quando: r.quando, nome: r.nome || r.telefone, valor: r.valor }));

  const enviadas = db
    .prepare(
      `SELECT nome, telefone, valor, atualizado_em AS quando
       FROM conversas
       WHERE empresa_id = ? AND fila_status = 'enviado' AND conversao_enviada = 1 AND atualizado_em >= ?
       ORDER BY atualizado_em ASC LIMIT 30`,
    )
    .all(empresaId, desde)
    .map((r) => ({ tipo: "venda_enviada", quando: r.quando, nome: r.nome || r.telefone, valor: r.valor }));

  const eventos = [...provaveis, ...enviadas].sort((a, b) => (a.quando < b.quando ? -1 : 1));
  return { eventos, agora };
}
