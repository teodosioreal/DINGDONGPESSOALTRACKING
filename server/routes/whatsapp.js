import { Router } from "express";
import { limitar } from "../rateLimit.js";
import {
  statusConexao,
  gerarQrCode,
  gerarCodigoPareamento,
  desconectar,
  empresaDoWebhook,
  normalizarPayloadInbound,
  credenciaisSalvas,
  salvarCredenciais,
  limparCredenciais,
  criarSessaoAutomatica,
} from "../whatsapp.js";
import { registrarMensagemRecebida } from "../conversas.js";

export const whatsappRouter = Router({ mergeParams: true });

whatsappRouter.get("/status", async (req, res) => {
  res.json(await statusConexao(req.empresaId));
});

/** Session ID e API Key da D-API, preenchidos na própria tela do painel. */
whatsappRouter.get("/credenciais", (req, res) => {
  const { sessionId, apiKey } = credenciaisSalvas(req.empresaId);
  res.json({ sessionId: sessionId ?? "", temApiKey: Boolean(apiKey) });
});

whatsappRouter.post("/credenciais", (req, res) => {
  const { sessionId, apiKey } = req.body ?? {};
  if (!sessionId || !apiKey) return res.status(400).json({ erro: "Preencha o Session ID e a API Key." });
  salvarCredenciais(req.empresaId, { sessionId, apiKey });
  res.json({ ok: true });
});

whatsappRouter.post("/credenciais/remover", (req, res) => {
  limparCredenciais(req.empresaId);
  res.json({ ok: true });
});

/** Cria a sessão na D-API automaticamente (nome da empresa + webhook já configurado). */
whatsappRouter.post("/criar-sessao-automatica", async (req, res) => {
  const r = await criarSessaoAutomatica(req.empresa);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json(r);
});

whatsappRouter.post("/conectar/qr", async (req, res) => {
  const r = await gerarQrCode(req.empresaId);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json(r);
});

whatsappRouter.post("/conectar/codigo", async (req, res) => {
  const { telefone } = req.body ?? {};
  const r = await gerarCodigoPareamento(req.empresaId, telefone);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json(r);
});

whatsappRouter.post("/desconectar", async (req, res) => {
  const r = await desconectar(req.empresaId);
  res.json(r);
});

/**
 * Webhook PÚBLICO — configure esta URL no painel da D-API (uma por empresa)
 * como "Ao receber": https://SEUDOMINIO/api/public/whatsapp/webhook?empresa=ID&chave=SEGREDO
 * (o segredo de cada empresa aparece na tela WhatsApp dela). Não passa pela
 * sessão de login — é o provedor externo chamando.
 */
export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.post("/webhook", async (req, res) => {
  const empresa = empresaDoWebhook(req);
  if (!empresa) return res.status(401).send("empresa ou chave inválida");

  // Limite por EMPRESA (não por IP): a D-API pode mandar de IPs compartilhados
  // entre várias contas, então limitar por IP arriscaria bloquear webhooks
  // legítimos de outros clientes dela.
  if (!limitar(`webhook-whatsapp:${empresa.id}`, { max: 120, janelaMs: 60_000 })) {
    return res.status(429).send("muitas requisições");
  }

  const { telefone, texto, deMim, grupo, nome } = normalizarPayloadInbound(req.body);
  if (!telefone || deMim || grupo) return res.send("ignorado");

  try {
    await registrarMensagemRecebida(empresa, { telefone, texto, nome });
  } catch (e) {
    console.error("Falha ao registrar mensagem recebida", e);
  }
  res.send("ok");
});
