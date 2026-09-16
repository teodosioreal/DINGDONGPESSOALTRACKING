import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function WhatsApp() {
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState(null);
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarStatus();
    const t = setInterval(carregarStatus, 4000);
    return () => clearInterval(t);
  }, []);

  async function carregarStatus() {
    try {
      setStatus(await api.whatsappStatus());
    } catch (e) {
      setErro(e.message);
    }
  }

  async function gerarQr() {
    setErro("");
    try {
      const r = await api.whatsappQr();
      setQr(r.imagemBase64);
      setCodigo(null);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function gerarCodigo() {
    setErro("");
    try {
      const r = await api.whatsappCodigo(telefone);
      setCodigo(r.codigo);
      setQr(null);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function desconectar() {
    await api.whatsappDesconectar();
    carregarStatus();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <span className={`size-2.5 rounded-full ${status?.conectado ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-sm font-medium">{status?.conectado ? "Conectado" : "Desconectado"}</span>
        {status?.numero && <span className="text-sm text-slate-500">— {status.numero}</span>}
      </div>

      {!status?.conectado && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex gap-4">
            <button onClick={gerarQr} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Gerar QR Code
            </button>
          </div>

          {qr && (
            <div className="mt-4">
              <img src={qr} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-md border border-slate-200" />
              <p className="mt-2 text-sm text-slate-500">Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.</p>
            </div>
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
