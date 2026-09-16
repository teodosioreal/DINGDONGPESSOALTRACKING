import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./db.js"; // garante que o schema é criado (e migrado) ao subir
import { authRouter } from "./routes/auth.js";
import { empresasRouter, empresaRouter } from "./routes/empresas.js";
import { googleRouter, registrarCallbackGoogle } from "./routes/google.js";
import { whatsappRouter, whatsappWebhookRouter } from "./routes/whatsapp.js";
import { trackPublicRouter } from "./routes/track.js";
import { conversasRouter, dashboardRouter } from "./routes/conversas.js";
import { ipBloqueioRouter } from "./routes/ipBloqueio.js";
import { carregarEmpresa } from "./routes/empresaMiddleware.js";
import { exigirSessao } from "./auth.js";

const obrigatorias = ["SESSION_SECRET", "ADMIN_USER", "ADMIN_PASSWORD_HASH", "APP_PUBLIC_URL"];
const faltando = obrigatorias.filter((v) => !process.env[v]);
if (faltando.length > 0) {
  console.error(`\nFaltam variáveis obrigatórias no .env: ${faltando.join(", ")}\n`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// Rotas públicas (sem login): callback OAuth do Google, pixel de clique e webhook do WhatsApp.
registrarCallbackGoogle(app);
app.use("/api/public/whatsapp", whatsappWebhookRouter);
app.use("/api/public", trackPublicRouter);
app.use("/api/auth", authRouter);

// Todo o resto de /api exige sessão logada.
app.use("/api/empresas", exigirSessao, empresasRouter);
app.use("/api/empresas/:empresaId", exigirSessao, carregarEmpresa, empresaRouter);
app.use("/api/empresas/:empresaId/google", exigirSessao, carregarEmpresa, googleRouter);
app.use("/api/empresas/:empresaId/whatsapp", exigirSessao, carregarEmpresa, whatsappRouter);
app.use("/api/empresas/:empresaId/conversas", exigirSessao, carregarEmpresa, conversasRouter);
app.use("/api/empresas/:empresaId/dashboard", exigirSessao, carregarEmpresa, dashboardRouter);
app.use("/api/empresas/:empresaId/ip-bloqueio", exigirSessao, carregarEmpresa, ipBloqueioRouter);

// Frontend (build do Vite) — SPA: qualquer rota que não seja /api/* cai no index.html.
const distDir = path.join(__dirname, "..", "web", "dist");
app.use(express.static(distDir));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const porta = Number(process.env.PORT ?? 3000);
app.listen(porta, () => {
  console.log(`DingDong pessoal rodando em http://127.0.0.1:${porta}`);
});
