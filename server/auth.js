import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "dingdong_sessao";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET não configurada no .env");
  return s;
}

/** Formato do hash salvo em ADMIN_PASSWORD_HASH: scrypt$<saltHex>$<hashHex> */
export function gerarHashSenha(senha) {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function senhaConfere(senha, hashSalvo) {
  const partes = (hashSalvo || "").split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const salt = Buffer.from(partes[1], "hex");
  const esperado = Buffer.from(partes[2], "hex");
  const calculado = scryptSync(senha, salt, 64);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export function credenciaisValidas(usuario, senha) {
  const usuarioEsperado = process.env.ADMIN_USER ?? "";
  const hashEsperado = process.env.ADMIN_PASSWORD_HASH ?? "";
  if (!usuarioEsperado || !hashEsperado) return false;
  if (usuario !== usuarioEsperado) return false;
  return senhaConfere(senha, hashEsperado);
}

function assinar(valor) {
  return createHmac("sha256", segredo()).update(valor).digest("hex");
}

export function criarTokenSessao() {
  const expiraEm = Date.now() + SESSION_TTL_MS;
  const corpo = `sessao.${expiraEm}`;
  return `${corpo}.${assinar(corpo)}`;
}

export function tokenValido(token) {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const corpo = `${partes[0]}.${partes[1]}`;
  const assinatura = partes[2];
  const esperado = assinar(corpo);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expiraEm = Number(partes[1]);
  return Number.isFinite(expiraEm) && Date.now() < expiraEm;
}

export function cookieDeSessao(token) {
  const seguro = (process.env.APP_PUBLIC_URL ?? "").startsWith("https://");
  const atributos = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (seguro) atributos.push("Secure");
  return atributos.join("; ");
}

export const cookieDeLogout = `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`;

function lerCookie(req, nome) {
  const cru = req.headers.cookie ?? "";
  for (const parte of cru.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessaoAtiva(req) {
  return tokenValido(lerCookie(req, SESSION_COOKIE));
}

/** Middleware: exige sessão válida para rotas privadas do painel. */
export function exigirSessao(req, res, next) {
  if (!sessaoAtiva(req)) {
    return res.status(401).json({ erro: "Sessão expirada. Entre novamente." });
  }
  next();
}
