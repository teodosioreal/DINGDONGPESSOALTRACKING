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
} from "../conversas.js";
import { enviarMensagem } from "../whatsapp.js";

export const conversasRouter = Router({ mergeParams: true });

conversasRouter.get("/", (req, res) => {
  res.json({ conversas: listarConversas(req.empresaId) });
});

conversasRouter.get("/:id/mensagens", (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  res.json({ conversa, mensagens: listarMensagens(conversa.id) });
});

conversasRouter.post("/:id/mensagens", async (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  const texto = String(req.body?.texto ?? "").trim();
  if (!texto) return res.status(400).json({ erro: "Mensagem vazia." });
  const r = await enviarMensagem(req.empresaId, conversa.telefone, texto);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  registrarMensagemEnviada(req.empresaId, { telefone: conversa.telefone, texto });
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

/** Vendas esperando o envio automático (08h/20h) — tela "Vendas para Envio". */
dashboardRouter.get("/fila-envio", (req, res) => {
  res.json({ fila: listarFila(req.empresaId) });
});

dashboardRouter.post("/fila-envio/:id/enviar-agora", async (req, res) => {
  const conversa = buscarConversa(req.empresaId, req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Venda não encontrada." });
  const r = await enviarVendaAgora(req.empresa, conversa);
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
