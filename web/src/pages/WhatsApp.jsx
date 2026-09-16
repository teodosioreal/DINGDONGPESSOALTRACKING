import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function WhatsApp() {
  const navigate = useNavigate();
  const { empresaId } = useParams();
  const [status, setStatus] = useState(null);
  const [credenciais, setCredenciais] = useState(null);
  const [qr, setQr] = useState(null);
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [criandoSessao, setCriandoSessao] = useState(false);

  useEffect(() => {
    setStatus(null);
    setCredenciais(null);
    setQr(null);
    setCodigo(null);
    carregarCredenciais();
    carregarStatus();
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
    setCredenciais(await api.whatsappCredenciais(empresaId));
  }

  async function carregarStatus() {
    try {
      setStatus(await api.whatsappStatus(empresaId));
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
    const confirmou = window.confirm("Remover esta sessão? Você vai precisar criar uma nova pra reconectar.");
    if (!confirmou) return;
    await api.whatsappRemoverCredenciais(empresaId);
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

      {erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {aviso}
        </p>
      )}

      {!configurado && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            Cria a sessão na D-API automaticamente, já com o nome desta empresa e o webhook configurado — sem
            precisar entrar no painel da D-API.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={criarSessaoAutomaticamente}
              disabled={criandoSessao}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {criandoSessao ? "Criando…" : "Criar sessão automaticamente"}
            </button>
            <button
              onClick={() => navigate(`/app/empresas/${empresaId}`)}
              className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
            >
              Configurar depois
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className={`size-2.5 rounded-full ${status?.conectado ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-sm font-medium">{status?.conectado ? "Conectado" : "Desconectado"}</span>
        {status?.numero && <span className="text-sm text-slate-500 dark:text-slate-400">— {status.numero}</span>}
        {configurado && !status?.conectado && (
          <button
            onClick={removerCredenciais}
            className="ml-auto text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Remover sessão
          </button>
        )}
      </div>

      {configurado && !status?.conectado && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {qr ? (
            <div>
              <img
                src={qr}
                alt="QR Code do WhatsApp"
                className="h-56 w-56 rounded-md border border-slate-200 dark:border-slate-700"
              />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho. O código se atualiza sozinho.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Buscando QR Code…</p>
          )}

          <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
            <p className="mb-2 text-sm font-medium">Ou conectar por código de 8 dígitos</p>
            <div className="flex gap-2">
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="5511999999999"
                className="w-56 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={gerarCodigo}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Gerar código
              </button>
            </div>
            {codigo && <p className="mt-3 text-2xl font-semibold tracking-widest">{codigo}</p>}
          </div>
        </div>
      )}

      {status?.conectado && (
        <button
          onClick={desconectar}
          className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Desconectar
        </button>
      )}
    </div>
  );
}
