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

  // ---- Empresas ----
  empresas: () => chamar("/api/empresas"),
  criarEmpresa: (nome) => chamar("/api/empresas", { method: "POST", body: { nome } }),
  empresa: (empresaId) => chamar(`/api/empresas/${empresaId}`),
  apagarEmpresa: (empresaId) => chamar(`/api/empresas/${empresaId}`, { method: "DELETE" }),
  salvarRegrasVenda: (empresaId, palavrasChave, confirmarAntesDeEnviar) =>
    chamar(`/api/empresas/${empresaId}/regras-venda`, {
      method: "PUT",
      body: { palavrasChave, confirmarAntesDeEnviar },
    }),

  dashboard: (empresaId) => chamar(`/api/empresas/${empresaId}/dashboard/resumo`),
  filaEnvio: (empresaId) => chamar(`/api/empresas/${empresaId}/dashboard/fila-envio`),
  enviarVendaAgora: (empresaId, id) =>
    chamar(`/api/empresas/${empresaId}/dashboard/fila-envio/${id}/enviar-agora`, { method: "POST" }),
  cancelarEnvioVenda: (empresaId, id) =>
    chamar(`/api/empresas/${empresaId}/dashboard/fila-envio/${id}/cancelar`, { method: "POST" }),

  // ---- Google Ads ----
  googleStatus: (empresaId) => chamar(`/api/empresas/${empresaId}/google/status`),
  googleAuthUrl: (empresaId) => chamar(`/api/empresas/${empresaId}/google/auth-url`),
  googleDesconectar: (empresaId) => chamar(`/api/empresas/${empresaId}/google/desconectar`, { method: "POST" }),
  googleContas: (empresaId) => chamar(`/api/empresas/${empresaId}/google/contas`),
  googleSubcontas: (empresaId, mccId) => chamar(`/api/empresas/${empresaId}/google/contas/${mccId}/subcontas`),
  googleEscolherConta: (empresaId, customerId, nome, loginCustomerId) =>
    chamar(`/api/empresas/${empresaId}/google/contas/escolher`, {
      method: "POST",
      body: { customerId, nome, loginCustomerId },
    }),
  googleCampanhas: (empresaId) => chamar(`/api/empresas/${empresaId}/google/campanhas`),

  // ---- WhatsApp ----
  whatsappStatus: (empresaId) => chamar(`/api/empresas/${empresaId}/whatsapp/status`),
  whatsappQr: (empresaId) => chamar(`/api/empresas/${empresaId}/whatsapp/conectar/qr`, { method: "POST" }),
  whatsappCodigo: (empresaId, telefone) =>
    chamar(`/api/empresas/${empresaId}/whatsapp/conectar/codigo`, { method: "POST", body: { telefone } }),
  whatsappDesconectar: (empresaId) => chamar(`/api/empresas/${empresaId}/whatsapp/desconectar`, { method: "POST" }),
  whatsappCredenciais: (empresaId) => chamar(`/api/empresas/${empresaId}/whatsapp/credenciais`),
  whatsappSalvarCredenciais: (empresaId, sessionId, apiKey) =>
    chamar(`/api/empresas/${empresaId}/whatsapp/credenciais`, { method: "POST", body: { sessionId, apiKey } }),
  whatsappRemoverCredenciais: (empresaId) =>
    chamar(`/api/empresas/${empresaId}/whatsapp/credenciais/remover`, { method: "POST" }),
  whatsappCriarSessaoAutomatica: (empresaId) =>
    chamar(`/api/empresas/${empresaId}/whatsapp/criar-sessao-automatica`, { method: "POST" }),

  // ---- Conversas ----
  conversas: (empresaId) => chamar(`/api/empresas/${empresaId}/conversas`),
  conversa: (empresaId, id) => chamar(`/api/empresas/${empresaId}/conversas/${id}/mensagens`),
  enviarMensagem: (empresaId, id, texto) =>
    chamar(`/api/empresas/${empresaId}/conversas/${id}/mensagens`, { method: "POST", body: { texto } }),
  marcarVenda: (empresaId, id, valor) =>
    chamar(`/api/empresas/${empresaId}/conversas/${id}/venda`, { method: "POST", body: { valor } }),
  descartarVenda: (empresaId, id) =>
    chamar(`/api/empresas/${empresaId}/conversas/${id}/descartar-venda`, { method: "POST" }),

  // ---- Bloqueio de IP ----
  visitasIp: (empresaId) => chamar(`/api/empresas/${empresaId}/ip-bloqueio`),
  bloquearIp: (empresaId, ip) =>
    chamar(`/api/empresas/${empresaId}/ip-bloqueio/bloquear`, { method: "POST", body: { ip } }),
  desbloquearIp: (empresaId, ip) =>
    chamar(`/api/empresas/${empresaId}/ip-bloqueio/desbloquear`, { method: "POST", body: { ip } }),
};
