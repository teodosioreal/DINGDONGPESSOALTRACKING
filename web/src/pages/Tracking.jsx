import { useState } from "react";
import { useParams } from "react-router-dom";

export default function Tracking() {
  const { empresaId } = useParams();
  const [copiado, setCopiado] = useState(false);
  const script = `<script src="${window.location.origin}/t.js" data-empresa="${empresaId}" async></script>`;

  function copiar() {
    navigator.clipboard.writeText(script).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Instalar rastreio</h1>
      <p className="text-sm text-slate-600">
        Cole este script no <code className="rounded bg-slate-100 px-1">&lt;head&gt;</code> do seu site, antes de{" "}
        <code className="rounded bg-slate-100 px-1">&lt;/head&gt;</code>. Ele captura o gclid do clique de anúncio e
        marca automaticamente os links de WhatsApp da página.
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-900 p-4">
        <code className="break-all text-sm text-slate-100">{script}</code>
      </div>

      <button
        onClick={copiar}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        {copiado ? "Copiado!" : "Copiar código"}
      </button>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Importante: seus links de WhatsApp precisam apontar para <code>wa.me</code> ou{" "}
        <code>whatsapp.com</code> para o script conseguir marcá-los.
      </div>
    </div>
  );
}
