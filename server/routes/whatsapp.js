import { Router } from "express";
import {
  statusConexao,
  gerarQrCode,
  gerarCodigoPareamento,
  desconectar,
  webhookAutorizado,
  normalizarPayloadInbound,
  credenciaisSalvas,
  salvarCredenciais,
  limparCredenciais,
} from "../whatsapp.js";
import { registrarMensagemRecebida } from "../conversas.js";

export const whatsappRouter = Router();

whatsappRouter.get("/status", async (_req, res) => {
  res.json(await statusConexao());
});

/** Session ID e API Key da D-API, preenchidos na própria tela do painel. */
whatsappRouter.get("/credenciais", (_req, res) => {
  const { sessionId, apiKey } = credenciaisSalvas();
  res.json({ sessionId: sessionId ?? "", temApiKey: Boolean(apiKey) });
});

whatsappRouter.post("/credenciais", (req, res) => {
  const { sessionId, apiKey } = req.body ?? {};
  if (!sessionId || !apiKey) return res.status(400).json({ erro: "Preencha o Session ID e a API Key." });
  salvarCredenciais({ sessionId, apiKey });
  res.json({ ok: true });
});

whatsappRouter.post("/credenciais/remover", (_req, res) => {
  limparCredenciais();
  res.json({ ok: true });
});

whatsappRouter.post("/conectar/qr", async (_req, res) => {
  const r = await gerarQrCode();
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json(r);
});

whatsappRouter.post("/conectar/codigo", async (req, res) => {
  const { telefone } = req.body ?? {};
  const r = await gerarCodigoPareamento(telefone);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json(r);
});

whatsappRouter.post("/desconectar", async (_req, res) => {
  const r = await desconectar();
  res.json(r);
});

/**
 * Webhook PÚBLICO — configure esta URL no painel da Z-API/D-API como
 * "Ao receber": https://SEUDOMINIO/api/public/whatsapp/webhook?chave=SEGREDO
 * Não passa pela sessão de login (é o provedor externo chamando).
 */
export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.post("/webhook", (req, res) => {
  if (!webhookAutorizado(req)) return res.status(401).send("chave inválida");

  const { telefone, texto, deMim, grupo, nome } = normalizarPayloadInbound(req.body);
  if (!telefone || deMim || grupo) return res.send("ignorado");

  try {
    registrarMensagemRecebida({ telefone, texto, nome });
  } catch (e) {
    console.error("Falha ao registrar mensagem recebida", e);
  }
  res.send("ok");
});
