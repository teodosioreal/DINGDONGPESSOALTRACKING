import { Router } from "express";
import { limitar, ipDe } from "../rateLimit.js";
import {
  credenciaisValidas,
  criarTokenSessao,
  cookieDeSessao,
  cookieDeLogout,
  sessaoAtiva,
  trocarSenha,
  exigirSessao,
} from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  if (!limitar(`login:${ipDe(req)}`, { max: 10, janelaMs: 60_000 })) {
    return res.status(429).json({ erro: "Muitas tentativas. Aguarde um instante." });
  }
  const { usuario, senha } = req.body ?? {};
  if (!usuario || !senha || !credenciaisValidas(usuario, senha)) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos." });
  }
  res.setHeader("Set-Cookie", cookieDeSessao(criarTokenSessao()));
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", cookieDeLogout);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  res.json({ usuario: sessaoAtiva(req) ? (process.env.ADMIN_USER ?? null) : null });
});

authRouter.post("/trocar-senha", exigirSessao, (req, res) => {
  if (!limitar(`trocar-senha:${ipDe(req)}`, { max: 10, janelaMs: 60_000 })) {
    return res.status(429).json({ erro: "Muitas tentativas. Aguarde um instante." });
  }
  const { senhaAtual, novaSenha } = req.body ?? {};
  if (!senhaAtual || !novaSenha) return res.status(400).json({ erro: "Preencha a senha atual e a nova senha." });
  const r = trocarSenha(senhaAtual, novaSenha);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true });
});
