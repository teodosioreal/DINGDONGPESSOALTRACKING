import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function WhatsApp() {
  const { empresaId } = useParams();
  const [status, setStatus] = useState(null);
  const [credenciais, setCredenciais] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [qr, setQr] = useState(null);
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [webhookSecret, setWebhookSecret] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [criandoSessao, setCriandoSessao] = useState(false);

  useEffect(() => {
    setStatus(null);
    setCredenciais(null);
    setQr(null);
    setCodigo(null);
    carregarCredenciais();
    carregarStatus();
    api.empresa(empresaId).then((r) => setWebhookSecret(r.empresa.webhook_secret)).catch(() => {});
    const t = setInterval(carregarStatus, 8000);
    return () => clearInterval(t);
  }, [empresaId]);

  // Enquanto não conectar, busca/atualiza o QR Code a cada 5s (ele expira rápido).
  useEffect(() => {
    if (!credenciais?.temApiKey || status?.conectado) return;
    let cancelado = false;

    async function atualizarQr() {
      try {
        const r = await api.whatsappQr(empresaId);
        if (cancelado) return;
        if (r.conectado) {
          setQr(null);
          setStatus((s) => ({ ...s, conectado: true }));
        } else {
          setQr(r.imagemBase64 ?? null);
        }
      } catch (e) {
        if (!cancelado) setErro(e.message);
      }
    }

    atualizarQr();
    const t = setInterval(atualizarQr, 5000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [empresaId, credenciais?.temApiKey, status?.conectado]);

  async function carregarCredenciais() {
    const r = await api.whatsappCredenciais(empresaId);
    setCredenciais(r);
    setSessionId(r.sessionId ?? "");
  }

  async function carregarStatus() {
    try {
      setStatus(await api.whatsappStatus(empresaId));
    } catch (e) {
      setErro(e.message);
    }
  }

  async function salvarCredenciais(e) {
    e.preventDefault();
    setErro("");
    setAviso("");
    try {
      await api.whatsappSalvarCredenciais(empresaId, sessionId, apiKey);
      setApiKey("");
      setAviso("Credenciais salvas.");
      await carregarCredenciais();
      await carregarStatus();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function criarSessaoAutomaticamente() {
    setErro("");
    setAviso("");
    setCriandoSessao(true);
    try {
      await api.whatsappCriarSessaoAutomatica(empresaId);
      setAviso("Sessão criada! Escaneie o QR Code abaixo.");
      await carregarCredenciais();
      await carregarStatus();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCriandoSessao(false);
    }
  }

  async function removerCredenciais() {
    await api.whatsappRemoverCredenciais(empresaId);
    setSessionId("");
    setApiKey("");
    setQr(null);
    setCodigo(null);
    await carregarCredenciais();
    await carregarStatus();
  }

  async function gerarCodigo() {
    setErro("");
    try {
      const r = await api.whatsappCodigo(empresaId, telefone);
      setCodigo(r.codigo);
      setQr(null);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function desconectar() {
    await api.whatsappDesconectar(empresaId);
    carregarStatus();
  }

  const configurado = credenciais?.temApiKey;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
      {aviso && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{aviso}</p>}

      {!configurado && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="mb-3 text-sm text-slate-600">
            Cria a sessão na D-API automaticamente, já com o nome desta empresa e o webhook configurado — sem
            precisar entrar no painel da D-API.
          </p>
          <button
            onClick={criarSessaoAutomaticamente}
            disabled={criandoSessao}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {criandoSessao ? "Criando…" : "Criar sessão automaticamente"}
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {configurado ? "Credenciais da D-API" : "Ou preencha manualmente"}
        </h2>
        <form onSubmit={salvarCredenciais} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-sm text-slate-600">Session ID</label>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Session ID fornecido pela D-API"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={configurado ? "•••••••• (já salva — digite para trocar)" : "API Key fornecida pela D-API"}
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Salvar credenciais
            </button>
            {configurado && (
              <button type="button" onClick={removerCredenciais} className="text-sm font-medium text-red-600 hover:underline">
                Remover
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <span className={`size-2.5 rounded-full ${status?.conectado ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-sm font-medium">{status?.conectado ? "Conectado" : "Desconectado"}</span>
        {status?.numero && <span className="text-sm text-slate-500">— {status.numero}</span>}
      </div>

      {webhookSecret && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-900">
            Configure esta URL no painel da D-API como webhook "Ao receber mensagem" — sem isso as mensagens não chegam aqui:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-white px-3 py-2 text-xs text-slate-700">
              {`${window.location.origin}/api/public/whatsapp/webhook?empresa=${empresaId}&chave=${webhookSecret}`}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/api/public/whatsapp/webhook?empresa=${empresaId}&chave=${webhookSecret}`,
                );
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
              className="shrink-0 rounded-md border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {configurado && !status?.conectado && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          {qr ? (
            <div>
              <img src={qr} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-md border border-slate-200" />
              <p className="mt-2 text-sm text-slate-500">
                Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho. O código se atualiza sozinho.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Buscando QR Code…</p>
          )}

          <div className="mt-6 border-t border-slate-100 pt-6">
            <p className="mb-2 text-sm font-medium">Ou conectar por código de 8 dígitos</p>
            <div className="flex gap-2">
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="5511999999999"
                className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button onClick={gerarCodigo} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium">
                Gerar código
              </button>
            </div>
            {codigo && <p className="mt-3 text-2xl font-semibold tracking-widest">{codigo}</p>}
          </div>
        </div>
      )}

      {status?.conectado && (
        <button onClick={desconectar} className="text-sm font-medium text-red-600 hover:underline">
          Desconectar
        </button>
      )}
    </div>
  );
}
