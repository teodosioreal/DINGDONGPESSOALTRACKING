import { Router } from "express";
import { listarConversas, buscarConversa, listarMensagens, marcarVenda, registrarMensagemEnviada, resumoDashboard } from "../conversas.js";
import { enviarConversaoGoogle } from "../googleAds.js";
import { enviarMensagem } from "../whatsapp.js";

export const conversasRouter = Router();

conversasRouter.get("/", (_req, res) => {
  res.json({ conversas: listarConversas() });
});

conversasRouter.get("/:id/mensagens", (req, res) => {
  const conversa = buscarConversa(req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  res.json({ conversa, mensagens: listarMensagens(conversa.id) });
});

conversasRouter.post("/:id/mensagens", async (req, res) => {
  const conversa = buscarConversa(req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  const texto = String(req.body?.texto ?? "").trim();
  if (!texto) return res.status(400).json({ erro: "Mensagem vazia." });
  const r = await enviarMensagem(conversa.telefone, texto);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  registrarMensagemEnviada({ telefone: conversa.telefone, texto });
  res.json({ ok: true });
});

/** Marca a conversa como vendida e, se houver gclid, envia a conversão pro Google Ads. */
conversasRouter.post("/:id/venda", async (req, res) => {
  const conversa = buscarConversa(req.params.id);
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
  const valor = Number(req.body?.valor);
  if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ erro: "Informe um valor válido." });

  let conversaoEnviada = false;
  let respostaConversao = null;
  if (conversa.gclid) {
    const r = await enviarConversaoGoogle({ gclid: conversa.gclid, valor });
    conversaoEnviada = r.ok;
    respostaConversao = r.ok ? "Conversão enviada ao Google Ads." : r.erro;
  } else {
    respostaConversao = "Sem gclid nesta conversa — venda marcada, mas nada foi enviado ao Google Ads.";
  }

  marcarVenda(conversa.id, { valor, conversaoEnviada, respostaConversao });
  res.json({ ok: true, conversaoEnviada, respostaConversao });
});

export const dashboardRouter = Router();
dashboardRouter.get("/resumo", (_req, res) => {
  res.json(resumoDashboard());
});
