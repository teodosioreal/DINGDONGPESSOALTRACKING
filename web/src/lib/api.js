async function chamar(caminho, opts = {}) {
  const res = await fetch(caminho, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro ?? `Erro ${res.status}`);
  return dados;
}

export const api = {
  login: (usuario, senha) => chamar("/api/auth/login", { method: "POST", body: { usuario, senha } }),
  logout: () => chamar("/api/auth/logout", { method: "POST" }),
  eu: () => chamar("/api/auth/me"),

  dashboard: () => chamar("/api/dashboard/resumo"),

  googleStatus: () => chamar("/api/google/status"),
  googleAuthUrl: () => chamar("/api/google/auth-url"),
  googleDesconectar: () => chamar("/api/google/desconectar", { method: "POST" }),
  googleContas: () => chamar("/api/google/contas"),
  googleSubcontas: (mccId) => chamar(`/api/google/contas/${mccId}/subcontas`),
  googleEscolherConta: (customerId, nome, loginCustomerId) =>
    chamar("/api/google/contas/escolher", { method: "POST", body: { customerId, nome, loginCustomerId } }),
  googleCampanhas: () => chamar("/api/google/campanhas"),

  whatsappStatus: () => chamar("/api/whatsapp/status"),
  whatsappQr: () => chamar("/api/whatsapp/conectar/qr", { method: "POST" }),
  whatsappCodigo: (telefone) => chamar("/api/whatsapp/conectar/codigo", { method: "POST", body: { telefone } }),
  whatsappDesconectar: () => chamar("/api/whatsapp/desconectar", { method: "POST" }),
  whatsappCredenciais: () => chamar("/api/whatsapp/credenciais"),
  whatsappSalvarCredenciais: (sessionId, apiKey) =>
    chamar("/api/whatsapp/credenciais", { method: "POST", body: { sessionId, apiKey } }),
  whatsappRemoverCredenciais: () => chamar("/api/whatsapp/credenciais/remover", { method: "POST" }),

  conversas: () => chamar("/api/conversas"),
  conversa: (id) => chamar(`/api/conversas/${id}/mensagens`),
  enviarMensagem: (id, texto) => chamar(`/api/conversas/${id}/mensagens`, { method: "POST", body: { texto } }),
  marcarVenda: (id, valor) => chamar(`/api/conversas/${id}/venda`, { method: "POST", body: { valor } }),
};
