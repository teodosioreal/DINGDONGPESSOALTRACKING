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
} from "../conversas.js";
import { enviarMensagem } from "../whatsapp.js";
import { marcarConversaLida, contarConversasNaoLidas, checklistSetup, contarIpsBloqueados } from "../db.js";
import { metricasCampanhasSelecionadas } from "../googleAds.js";

export const conversasRouter = Router({ mergeParams: true });

conversasRouter.get("/", (req, res) => {
  res.json({ conversas: listarConversas(req.empresaId) });
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
  await registrarMensagemEnviada(req.empresa, { telefone: conversa.telefone, texto, nome: conversa.nome });
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

export const dashboardRouter = Router({ mergeParams: true });
dashboardRouter.get("/resumo", (req, res) => {
  res.json(resumoDashboard(req.empresaId));
});

/** O que já está configurado nessa empresa (Google/WhatsApp/Regras) + último clique recebido. */
dashboardRouter.get("/checklist", (req, res) => {
  res.json(checklistSetup(req.empresaId));
});

/** Vendas esperando o envio automático (08h/20h) — tela "Vendas para Envio". */
dashboardRouter.get("/fila-envio", (req, res) => {
  res.json({ fila: listarFila(req.empresaId) });
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
