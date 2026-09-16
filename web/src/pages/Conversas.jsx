import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const NOME_ORIGEM = { google: "Google Ads", meta: "Meta Ads", sem_rastreio: "Sem rastreio" };

export default function Conversas() {
  const [conversas, setConversas] = useState([]);
  const [selecionada, setSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    carregarLista();
    const t = setInterval(carregarLista, 15000);
    return () => clearInterval(t);
  }, []);

  async function carregarLista() {
    const r = await api.conversas();
    setConversas(r.conversas);
  }

  async function abrir(conversa) {
    setSelecionada(conversa);
    setAviso("");
    const r = await api.conversa(conversa.id);
    setMensagens(r.mensagens);
  }

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim() || !selecionada) return;
    await api.enviarMensagem(selecionada.id, texto);
    setTexto("");
    abrir(selecionada);
  }

  async function marcarVenda(e) {
    e.preventDefault();
    if (!selecionada) return;
    try {
      const r = await api.marcarVenda(selecionada.id, valorVenda);
      setAviso(r.respostaConversao);
      setValorVenda("");
      carregarLista();
    } catch (e) {
      setAviso(e.message);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      <div className="w-80 shrink-0 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {conversas.map((c) => (
          <button
            key={c.id}
            onClick={() => abrir(c)}
            className={`block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 ${
              selecionada?.id === c.id ? "bg-slate-100" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.nome || c.telefone}</span>
              {c.status === "vendido" && <span className="text-xs font-semibold text-green-600">VENDIDO</span>}
            </div>
            <span className="text-xs text-slate-500">{NOME_ORIGEM[c.origem] ?? c.origem}</span>
          </button>
        ))}
        {conversas.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma conversa ainda.</p>}
      </div>

      <div className="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white">
        {!selecionada ? (
          <div className="grid flex-1 place-items-center text-sm text-slate-400">Selecione uma conversa</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="font-medium">{selecionada.nome || selecionada.telefone}</p>
                <p className="text-xs text-slate-500">{selecionada.telefone}</p>
              </div>
              <form onSubmit={marcarVenda} className="flex items-center gap-2">
                <input
                  value={valorVenda}
                  onChange={(e) => setValorVenda(e.target.value)}
                  placeholder="Valor da venda"
                  className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button type="submit" className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white">
                  Marcar venda
                </button>
              </form>
            </div>

            {aviso && <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">{aviso}</p>}

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {mensagens.map((m) => (
                <div key={m.id} className={`flex ${m.de_mim ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                      m.de_mim ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {m.texto}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={enviar} className="flex gap-2 border-t border-slate-100 p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva uma mensagem…"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Enviar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
