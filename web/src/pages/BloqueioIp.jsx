import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

function formatarDuracao(segundos) {
  if (segundos == null) return "—";
  const s = Number(segundos);
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return min > 0 ? `${min}min ${seg}s` : `${seg}s`;
}

function formatarData(dataIso) {
  if (!dataIso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(dataIso + "Z"),
    );
  } catch {
    return dataIso;
  }
}

export default function BloqueioIp() {
  const { empresaId } = useParams();
  const [visitas, setVisitas] = useState([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState("");

  async function carregar() {
    try {
      const r = await api.visitasIp(empresaId);
      setVisitas(r.visitas);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [empresaId]);

  async function alternarBloqueio(ip, bloqueadoAtualmente) {
    setProcessando(ip);
    setErro("");
    try {
      if (bloqueadoAtualmente) {
        await api.desbloquearIp(empresaId, ip);
      } else {
        await api.bloquearIp(empresaId, ip);
      }
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setProcessando("");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bloqueio de IP</h1>
        <p className="mt-1 text-sm text-slate-600">
          Todo visitante que passa pelo script de rastreio aparece aqui com o IP, se veio de um anúncio e quanto
          tempo ficou no site. Bloquear um IP não mexe na sua campanha do Google Ads — é só interno: a partir daí,
          se esse IP fechar uma "venda" numa conversa, a conversão não é mais enviada. Você decide o critério (ex:
          muitas visitas rápidas do mesmo IP, tempo no site muito baixo, etc).
        </p>
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {carregando ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : visitas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          Ainda não há visitas registradas com IP. Confira se o script (t.js) está instalado no seu site.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Visitas</th>
                <th className="px-4 py-3">Tempo no site</th>
                <th className="px-4 py-3">Última visita</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visitas.map((v) => (
                <tr key={v.ip} className={v.bloqueado ? "bg-red-50/40" : ""}>
                  <td className="px-4 py-3 font-mono text-xs">{v.ip}</td>
                  <td className="px-4 py-3">
                    {v.veioDeAnuncio ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Veio de anúncio
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Direto/outro
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{v.visitas}</td>
                  <td className="px-4 py-3">{formatarDuracao(v.duracao_segundos)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatarData(v.ultima_visita)}</td>
                  <td className="px-4 py-3">
                    {v.bloqueado ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Bloqueado
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Liberado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => alternarBloqueio(v.ip, v.bloqueado)}
                      disabled={processando === v.ip}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        v.bloqueado
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          : "bg-red-600 text-white hover:bg-red-700"
                      }`}
                    >
                      {v.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
