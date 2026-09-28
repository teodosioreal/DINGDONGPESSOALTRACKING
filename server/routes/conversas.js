import { Router } from "express";
import {
  listarConversas,
  buscarConversa,
  listarMensagens,
  confirmarVenda,
  descartarVendaProvavel,
  registrarMensagemEnviada,
  resumoDashboard,
  listarFila,
  enviarVendaAgora,
  cancelarEnvio,
  eventosRecentes,
  apagarConversa,
  apagarTodasConversas,
  arquivarConversa,
  desarquivarConversa,
} from "../conversas.js";
import { enviarMensagem } from "../whatsapp.js";
import { marcarConversaLida, contarConversasNaoLidas, checklistSetup, contarIpsBloqueados } from "../db.js";
import { metricasCampanhasSelecionadas, nomesDeCampanhas } from "../googleAds.js";

export const conversasRouter = Router({ mergeParams: true });

conversasRouter.get("/", (req, res) => {
  res.json({ conversas: listarConversas(req.empresaId, { arquivadas: req.query.arquivadas === "1" }) });
});

conversasRouter.get("/nao-lidas", (req, res) => {
  res.json({ total: contarConversasNaoLidas(req.empresaId) });
});

/** Eventos recentes (mensagem recebida/venda provável/venda enviada) pra central de notificações. */
conversasRouter.get("/eventos-recentes", (req, res) => {
  res.json(eventosRecentes(req.empresaId, req.query.desde ? String(req.query.desde) : null));
});

conversasRouter.get("/:id/mensagens", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  marcarConversaLida(conversa.id);
  res.json({ conversa, mensagens: listarMensagens(conversa.id) });
});

conversasRouter.post("/:id/mensagens", async (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  const texto = String(req.body?.texto ?? "").trim();
  if (!texto) return res.status(400).json({ erro: "Mensagem vazia." });
  const r = await enviarMensagem(req.empresaId, conversa.telefone, texto);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  await registrarMensagemEnviada(req.empresa, { telefone: conversa.telefone, texto });
  res.json({ ok: true });
});

/** Confirma a venda (manual, ou confirmando uma "venda provável" detectada). */
conversasRouter.post("/:id/venda", async (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  const valor = Number(req.body?.valor);
  if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ erro: "Informe um valor válido." });

  const empresa = req.empresa;
  const r = await confirmarVenda(empresa, conversa, valor);
  res.json({ ok: true, ...r });
});

/** Descarta uma "venda provável" que a detecção por palavra-chave errou. */
conversasRouter.post("/:id/descartar-venda", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  descartarVendaProvavel(conversa.id);
  res.json({ ok: true });
});

/** Arquiva a conversa — some da lista principal, sem apagar nada. */
conversasRouter.post("/:id/arquivar", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  arquivarConversa(req.empresaId, conversa.id);
  res.json({ ok: true });
});

/** Desarquiva — volta pra lista principal. */
conversasRouter.post("/:id/desarquivar", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  desarquivarConversa(req.empresaId, conversa.id);
  res.json({ ok: true });
});

/** Apaga um lead/conversa (ex: criado por engano, duplicado, teste). */
conversasRouter.delete("/:id", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  apagarConversa(req.empresaId, conversa.id);
  res.json({ ok: true });
});

/**
 * Apaga TODAS as conversas da empresa de uma vez (só aqui dentro do
 * DingDong — não mexe no WhatsApp de verdade). Preserva as que já viraram
 * venda, pra não perder o histórico da aba Vendas.
 */
conversasRouter.delete("/", (req, res) => {
  const r = apagarTodasConversas(req.empresaId);
  res.json({ ok: true, apagadas: r.apagadas });
});

export const dashboardRouter = Router({ mergeParams: true });
dashboardRouter.get("/resumo", (req, res) => {
  res.json(resumoDashboard(req.empresaId));
});

/** O que já está configurado nessa empresa (Google/WhatsApp/Regras) + último clique recebido. */
dashboardRouter.get("/checklist", (req, res) => {
  res.json(checklistSetup(req.empresaId));
});

/**
 * Vendas esperando o envio automático (08h/20h) — tela "Vendas para Envio".
 * Mesma resolução de ID pra nome de campanha que a aba Vendas (ver
 * routes/vendas.js) — senão a mesma venda mostraria o ID numérico aqui e o
 * nome de verdade lá, assim que ela é enviada.
 */
dashboardRouter.get("/fila-envio", async (req, res) => {
  const fila = listarFila(req.empresaId);
  const idsParaResolver = fila
    .filter((v) => v.plataforma === "google" && v.campanha && /^\d+$/.test(v.campanha))
    .map((v) => v.campanha);
  if (idsParaResolver.length > 0) {
    const nomes = await nomesDeCampanhas(req.empresaId, idsParaResolver);
    for (const v of fila) {
      if (nomes.has(v.campanha)) v.campanha = nomes.get(v.campanha);
    }
  }
  res.json({ fila });
});

dashboardRouter.post("/fila-envio/:id/enviar-agora", async (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Venda não encontrada." });
  const r = await enviarVendaAgora(conversa);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true });
});

dashboardRouter.post("/fila-envio/:id/cancelar", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Venda não encontrada." });
  const r = cancelarEnvio(conversa);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true });
});

/** Cards "Concorrentes Bloqueados" e "Cliques Inválidos" do Painel. */
dashboardRouter.get("/insights", async (req, res) => {
  const concorrentesBloqueados = contarIpsBloqueados(req.empresaId);
  const r = await metricasCampanhasSelecionadas(req.empresaId, req.query.periodo);
  res.json({
    concorrentesBloqueados,
    cliquesInvalidos: r.cliquesInvalidos,
    semSelecaoDeCampanhas: Boolean(r.semSelecao),
    erroGoogle: r.erro ?? null,
  });
});
