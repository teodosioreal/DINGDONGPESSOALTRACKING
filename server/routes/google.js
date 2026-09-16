import { Router } from "express";
import {
  urlDeConsentimento,
  estadoValido,
  trocarCodigoPorToken,
  emailDoAccessToken,
  conexaoSalva,
  salvarConexao,
  salvarContaEscolhida,
  desconectarGoogle,
  listarContas,
  listarSubcontasDe,
  listarCampanhas,
} from "../googleAds.js";

export const googleRouter = Router();

googleRouter.get("/status", (_req, res) => {
  const c = conexaoSalva();
  res.json({
    conectado: Boolean(c.refreshToken),
    email: c.email,
    customerId: c.customerId,
    customerNome: c.customerNome,
  });
});

googleRouter.get("/auth-url", (_req, res) => {
  const r = urlDeConsentimento();
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json({ url: r.url });
});

googleRouter.post("/desconectar", (_req, res) => {
  desconectarGoogle();
  res.json({ ok: true });
});

googleRouter.get("/contas", async (_req, res) => {
  const r = await listarContas();
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json({ contas: r.contas });
});

/** Subcontas de uma MCC específica — usado quando a conta escolhida é gerenciadora. */
googleRouter.get("/contas/:mccId/subcontas", async (req, res) => {
  if (!/^\d+$/.test(req.params.mccId)) return res.status(400).json({ erro: "MCC inválida." });
  const r = await listarSubcontasDe(req.params.mccId);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json({ contas: r.contas });
});

googleRouter.post("/contas/escolher", (req, res) => {
  const { customerId, nome, loginCustomerId } = req.body ?? {};
  if (!customerId) return res.status(400).json({ erro: "customerId obrigatório." });
  salvarContaEscolhida({ customerId, nome, loginCustomerId });
  res.json({ ok: true });
});

googleRouter.get("/campanhas", async (_req, res) => {
  const r = await listarCampanhas();
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json({ campanhas: r.campanhas });
});

/**
 * Callback público do OAuth do Google — precisa estar fora da autenticação
 * de sessão (o Google chama direto), mas é protegido pelo `state` assinado.
 * Registrado sem o prefixo /api pois é um redirect_uri "de raiz".
 */
export function registrarCallbackGoogle(app) {
  app.get("/auth/callback/google-ads", async (req, res) => {
    const base = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${base}/app/google-ads?erro=${encodeURIComponent(String(error))}`);
    if (!code || !state || !estadoValido(String(state))) {
      return res.redirect(`${base}/app/google-ads?erro=${encodeURIComponent("Retorno inválido do Google.")}`);
    }
    const r = await trocarCodigoPorToken(String(code));
    if (r.erro || !r.refreshToken) {
      return res.redirect(`${base}/app/google-ads?erro=${encodeURIComponent(r.erro ?? "Falha ao conectar.")}`);
    }
    const email = r.accessToken ? await emailDoAccessToken(r.accessToken).catch(() => "") : "";
    salvarConexao({ refreshToken: r.refreshToken, email });
    res.redirect(`${base}/app/google-ads?conectado=1`);
  });
}
