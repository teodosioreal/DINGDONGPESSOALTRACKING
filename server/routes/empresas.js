import { Router } from "express";
import { criarEmpresa, listarEmpresas, apagarEmpresa, atualizarRegrasVenda, cliqueDeTesteRecebido } from "../db.js";

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
