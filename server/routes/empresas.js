import { Router } from "express";
import {
  criarEmpresa,
  listarEmpresas,
  apagarEmpresa,
  atualizarRegrasVenda,
  cliqueDeTesteRecebido,
  regenerarTrackingToken,
  registrarSiteTestado,
  listarSitesTestados,
  removerSiteTestado,
} from "../db.js";

export const empresasRouter = Router();

empresasRouter.get("/", (_req, res) => {
  res.json({ empresas: listarEmpresas() });
});

empresasRouter.post("/", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  if (!nome) return res.status(400).json({ erro: "Informe o nome da empresa." });
  const empresa = criarEmpresa({ nome });
  res.json({ empresa });
});

/** Rotas abaixo já passaram pelo middleware carregarEmpresa (montado no index.js). */
export const empresaRouter = Router({ mergeParams: true });

empresaRouter.get("/", (req, res) => {
  res.json({ empresa: req.empresa });
});

empresaRouter.delete("/", (req, res) => {
  apagarEmpresa(req.empresaId);
  res.json({ ok: true });
});

empresaRouter.put("/regras-venda", (req, res) => {
  const { palavrasChave, confirmarAntesDeEnviar } = req.body ?? {};
  atualizarRegrasVenda(req.empresaId, { palavrasChave, confirmarAntesDeEnviar });
  res.json({ ok: true });
});

/** Usado pelo botão "Testar instalação" da tela Instalar Rastreio — checa se o clique de teste chegou. */
empresaRouter.get("/tracking/verificar", (req, res) => {
  const marcador = String(req.query?.marcador ?? "").trim();
  if (!marcador) return res.status(400).json({ erro: "Marcador inválido." });
  res.json({ recebido: cliqueDeTesteRecebido(req.empresaId, marcador) });
});

/** Troca o código de instalação — o script com o código antigo para de mandar cliques. */
empresaRouter.post("/tracking/regenerar-codigo", (req, res) => {
  const trackingToken = regenerarTrackingToken(req.empresaId);
  res.json({ ok: true, trackingToken });
});

/** Lista de sites onde o teste de instalação já deu certo — só organização, não afeta o rastreio. */
empresaRouter.get("/tracking/sites", (req, res) => {
  res.json({ sites: listarSitesTestados(req.empresaId) });
});

empresaRouter.post("/tracking/sites", (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ erro: "URL inválida." });
  registrarSiteTestado(req.empresaId, url);
  res.json({ ok: true });
});

empresaRouter.post("/tracking/sites/remover", (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ erro: "URL inválida." });
  removerSiteTestado(req.empresaId, url);
  res.json({ ok: true });
});
