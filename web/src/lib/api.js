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
  trocarSenha: (senhaAtual, novaSenha) =>
    chamar("/api/auth/trocar-senha", { method: "POST", body: { senhaAtual, novaSenha } }),

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
  verificarTracking: (empresaId, marcador) =>
    chamar(`/api/empresas/${empresaId}/tracking/verificar?marcador=${encodeURIComponent(marcador)}`),
  regenerarCodigoTracking: (empresaId) =>
    chamar(`/api/empresas/${empresaId}/tracking/regenerar-codigo`, { method: "POST" }),
  sitesTestados: (empresaId) => chamar(`/api/empresas/${empresaId}/tracking/sites`),
  registrarSiteTestado: (empresaId, url) =>
    chamar(`/api/empresas/${empresaId}/tracking/sites`, { method: "POST", body: { url } }),
  removerSiteTestado: (empresaId, url) =>
    chamar(`/api/empresas/${empresaId}/tracking/sites/remover`, { method: "POST", body: { url } }),

  dashboard: (empresaId) => chamar(`/api/empresas/${empresaId}/dashboard/resumo`),
  checklist: (empresaId) => chamar(`/api/empresas/${empresaId}/dashboard/checklist`),
  filaEnvio: (empresaId) => chamar(`/api/empresas/${empresaId}/dashboard/fila-envio`),
  enviarVendaAgora: (empresaId, id) =>
    chamar(`/api/empresas/${empresaId}/dashboard/fila-envio/${id}/enviar-agora`, { method: "POST" }),
  cancelarEnvioVenda: (empresaId, id) =>
    chamar(`/api/empresas/${empresaId}/dashboard/fila-envio/${id}/cancelar`, { method: "POST" }),
  insightsDashboard: (empresaId, periodo) =>
    chamar(`/api/empresas/${empresaId}/dashboard/insights?periodo=${encodeURIComponent(periodo)}`),

  // ---- Google Ads ----
  googleStatus: (empresaId) => chamar(`/api/empresas/${empresaId}/google/status`),
  googleAuthUrl: (empresaId) => chamar(`/api/empresas/${empresaId}/google/auth-url`),
  googleDesconectar: (empresaId) => chamar(`/api/empresas/${empresaId}/google/desconectar`, { method: "POST" }),
  googleContas: (empresaId) => chamar(`/api/empresas/${empresaId}/google/contas`),
  googleSubcontas: (empresaId, mccId) => chamar(`/api/empresas/${empresaId}/google/contas/${mccId}/subcontas`),
  googleContasMonitoradas: (empresaId) => chamar(`/api/empresas/${empresaId}/google/contas/selecionadas`),
  googleAdicionarConta: (empresaId, customerId, nome, loginCustomerId) =>
    chamar(`/api/empresas/${empresaId}/google/contas/selecionadas`, {
      method: "POST",
      body: { customerId, nome, loginCustomerId },
    }),
  googleRemoverConta: (empresaId, customerId) =>
    chamar(`/api/empresas/${empresaId}/google/contas/selecionadas/${customerId}`, { method: "DELETE" }),
  googleCampanhas: (empresaId, periodo) =>
    chamar(`/api/empresas/${empresaId}/google/campanhas?periodo=${encodeURIComponent(periodo)}`),
  googleCampanhasSelecionadas: (empresaId) => chamar(`/api/empresas/${empresaId}/google/campanhas/selecionadas`),
  googleSalvarCampanhasSelecionadas: (empresaId, ids) =>
    chamar(`/api/empresas/${empresaId}/google/campanhas/selecionadas`, { method: "POST", body: { ids } }),
  googleDefinirStatusCampanha: (empresaId, customerId, campanhaId, ativar) =>
    chamar(`/api/empresas/${empresaId}/google/campanhas/${customerId}/${campanhaId}/status`, {
      method: "POST",
      body: { ativar },
    }),

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
  conversasNaoLidas: (empresaId) => chamar(`/api/empresas/${empresaId}/conversas/nao-lidas`),
  eventosRecentes: (empresaId, desde) =>
    chamar(
      `/api/empresas/${empresaId}/conversas/eventos-recentes${desde ? `?desde=${encodeURIComponent(desde)}` : ""}`,
    ),
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
  configurarBloqueioAuto: (empresaId, ativo, cliques, minutos, escopo) =>
    chamar(`/api/empresas/${empresaId}/ip-bloqueio/config`, {
      method: "PUT",
      body: { ativo, cliques, minutos, escopo },
    }),
  economiaIp: (empresaId, periodo) =>
    chamar(`/api/empresas/${empresaId}/ip-bloqueio/economia?periodo=${encodeURIComponent(periodo)}`),

  // ---- Vendas ----
  vendas: (empresaId) => chamar(`/api/empresas/${empresaId}/vendas`),
  testarConversao: (empresaId) => chamar(`/api/empresas/${empresaId}/vendas/testar-conversao`),
};
