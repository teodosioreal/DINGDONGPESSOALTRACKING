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
import { registrarMensagemRecebida, registrarMensagemEnviada } from "../conversas.js";

export const whatsappRouter = Router({ mergeParams: true });

whatsappRouter.get("/status", async (req, res) => {
  res.json(await statusConexao(req.empresaId));
});

/** Instance Name e API Key da Evolution API, preenchidos na própria tela do painel. */
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

/** Cria a sessão na Evolution API automaticamente (nome da empresa + webhook já configurado). */
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
 * Webhook PÚBLICO — configurado automaticamente na Evolution API pelo botão
 * "Criar sessão automaticamente" (ou cole manualmente lá, se preferir), uma
 * URL por empresa: https://SEUDOMINIO/api/public/whatsapp/webhook?empresa=ID&chave=SEGREDO
 * (o segredo de cada empresa aparece na tela WhatsApp dela). Não passa pela
 * sessão de login — é a Evolution API chamando.
 */
export const whatsappWebhookRouter = Router();

// Depois que a sessão do WhatsApp reconecta (caiu e voltou, trocou de
// aparelho etc.), o Baileys costuma reenviar um lote de mensagens antigas
// (sincronização de histórico) pelo mesmo webhook messages.upsert — sem
// esse filtro, cada uma delas vira um "lead novo" (origem errada, sem
// rastreio nenhum). Mensagem com mais de 5 minutos de atraso em relação ao
// horário de agora é tratada como histórico, não evento ao vivo.
const ATRASO_MAXIMO_SEGUNDOS = 5 * 60;

whatsappWebhookRouter.post("/webhook", async (req, res) => {
  const empresa = empresaDoWebhook(req);
  if (!empresa) return res.status(401).send("empresa ou chave inválida");

  // Limite por EMPRESA (não por IP): a Evolution API pode mandar de IPs
  // compartilhados entre várias instâncias, então limitar por IP arriscaria
  // bloquear webhooks legítimos de outras empresas.
  if (!limitar(`webhook-whatsapp:${empresa.id}`, { max: 120, janelaMs: 60_000 })) {
    return res.status(429).send("muitas requisições");
  }

  const { telefone, texto, deMim, grupo, nome, anuncio, timestamp } = normalizarPayloadInbound(req.body);
  if (!telefone || grupo) return res.send("ignorado");
  if (timestamp && Date.now() / 1000 - timestamp > ATRASO_MAXIMO_SEGUNDOS) {
    return res.send("ignorado (mensagem antiga, provável sincronização de histórico)");
  }

  try {
    // Mensagens "de mim" (mandadas pela empresa, pelo painel ou direto do
    // celular conectado) são onde roda a detecção de venda por palavra-chave.
    // Não passa `nome` aqui: numa mensagem "de mim" o pushName é o da PRÓPRIA
    // empresa no WhatsApp, não o do cliente (ver registrarMensagemEnviada).
    if (deMim) {
      await registrarMensagemEnviada(empresa, { telefone, texto });
    } else {
      await registrarMensagemRecebida(empresa, { telefone, texto, nome, anuncio });
    }
  } catch (e) {
    console.error("Falha ao registrar mensagem", e);
  }
  res.send("ok");
});
