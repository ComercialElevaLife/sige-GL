import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { GOALS, monthLabel } from "./indicators";

const fmt = (value) => `${Math.round(value)}%`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const BREAKDOWNS = [
  ["sectorId", "Setor"],
  ["shift", "Turno"],
  ["unitId", "Unidade"],
  ["clientId", "Empresa"],
];

// Barra empilhada presença / ausência / falta (sobre as vagas das aulas aplicadas).
function SplitBar({ row, tall = false }) {
  if (!row.slots) return <div className={`dv-split empty ${tall ? "tall" : ""}`} aria-label="Sem aulas aplicadas" />;
  return (
    <div className={`dv-split ${tall ? "tall" : ""}`} role="img" aria-label={`Presença ${fmt(row.presentRate)}, ausência ${fmt(row.absentRate)}, falta ${fmt(row.missingRate)}`}>
      <i className="p" style={{ width: `${row.presentRate}%` }} />
      <i className="a" style={{ width: `${row.absentRate}%` }} />
      <i className="f" style={{ width: `${row.missingRate}%` }} />
    </div>
  );
}

function Kpi({ label, value, detail, goal, reached, tone }) {
  return (
    <article className={`dv-kpi ${tone || ""}`}>
      <span className="dv-kpi-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {goal != null && (
        <em className={reached ? "ok" : "warn"}>{reached ? "Meta atingida" : "Abaixo da meta"} · {goal}%</em>
      )}
    </article>
  );
}

function Breakdown({ groups }) {
  const [field, setField] = useState("sectorId");
  const rows = groups[field] || [];
  return (
    <section className="dv-card">
      <div className="dv-card-head">
        <div>
          <h2>Detalhamento por recorte</h2>
          <p>Percentuais sobre as vagas das aulas aplicadas; adesão sobre a lista de colaboradores.</p>
        </div>
        <div className="dv-seg" role="tablist" aria-label="Agrupar por">
          {BREAKDOWNS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={field === key} className={field === key ? "on" : ""} onClick={() => setField(key)}>{label}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="dv-muted">Sem dados para este recorte.</p>
      ) : (
        <div className="dv-table" role="table">
          <div className="dv-tr dv-th" role="row">
            <span>{BREAKDOWNS.find(([key]) => key === field)[1]}</span>
            <span className="dv-bar-col" />
            <span>Presença</span>
            <span>Ausência</span>
            <span>Falta</span>
            <span>Adesão</span>
          </div>
          {rows.map((row) => (
            <div className="dv-tr" role="row" key={row.key}>
              <strong>{row.label}</strong>
              <span className="dv-bar-col"><SplitBar row={row} /></span>
              <span data-label="Presença">{row.slots ? <><b>{fmt(row.presentRate)}</b><small>{row.present}</small></> : "—"}</span>
              <span data-label="Ausência">{row.slots ? <><b>{fmt(row.absentRate)}</b><small>{row.absent}</small></> : "—"}</span>
              <span data-label="Falta">{row.slots ? <><b>{fmt(row.missingRate)}</b><small>{row.missing}</small></> : "—"}</span>
              <span data-label="Adesão">{row.people ? <><b>{fmt(row.adherenceRate)}</b><small>{row.adhered}/{row.people}</small></> : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Collaborators({ rows }) {
  const attention = rows.filter((row) => row.slots && row.presentRate < GOALS.adherence).slice(0, 8);
  const none = rows.filter((row) => !row.slots).length;
  return (
    <section className="dv-card">
      <div className="dv-card-head">
        <div>
          <h2>Colaboradores com menor presença</h2>
          <p>Quem esteve abaixo de {GOALS.adherence}% das aulas aplicadas na lista dele. {none ? `${plural(none, "colaborador", "colaboradores")} sem nenhuma aula aplicada no período.` : ""}</p>
        </div>
      </div>
      {attention.length === 0 ? (
        <p className="dv-muted">Nenhum colaborador abaixo da meta neste recorte.</p>
      ) : (
        <div className="dv-people">
          {attention.map((row) => (
            <div key={row.person.id}>
              <strong>{row.person.name}</strong>
              <SplitBar row={row} />
              <span><b>{fmt(row.presentRate)}</b> presença · {row.present}/{row.slots}</span>
            </div>
          ))}
        </div>
      )}
      <details className="dv-more">
        <summary>Ver lista completa ({rows.length})</summary>
        <div className="dv-people full">
          {rows.map((row) => (
            <div key={row.person.id}>
              <strong>{row.person.name}</strong>
              <SplitBar row={row} />
              <span>{row.slots ? <><b>{fmt(row.presentRate)}</b> presença · {row.present}/{row.slots}</> : "Sem aulas no período"}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export default function DashboardView({ result, month, onMonth, loading, error, onRetry, pending, onPdf, filters, canNext }) {
  const shift = (delta) => {
    const [year, number] = month.split("-").map(Number);
    const next = new Date(year, number - 1 + delta, 1);
    onMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  const t = result?.totals;
  const c = result?.classes;
  return (
    <section className="dv">
      <header className="dv-head">
        <div>
          <p className="eyebrow">INDICADORES</p>
          <h1>Ginástica Laboral</h1>
        </div>
        <div className="dv-head-actions">
          <div className="dv-month">
            <button aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
            <strong>{monthLabel(month)}</strong>
            <button aria-label="Próximo mês" onClick={() => shift(1)} disabled={!canNext}><ChevronRight size={18} /></button>
          </div>
          <button className="primary" onClick={onPdf}><FileText size={18} /> Relatório em PDF</button>
        </div>
      </header>
      {filters}
      {pending > 0 && <p className="dv-note">{plural(pending, "aula aguarda", "aulas aguardam")} envio deste aparelho e ainda não {pending === 1 ? "entrou" : "entraram"} nos indicadores.</p>}
      {error ? (
        <div className="dv-empty">
          <h2>Não foi possível carregar os indicadores</h2>
          <p>{error}</p>
          <button className="secondary" onClick={onRetry}><RefreshCw size={16} /> Tentar de novo</button>
        </div>
      ) : loading && !result ? (
        <div className="dv-empty"><p>Carregando indicadores…</p></div>
      ) : !result?.hasData ? (
        <div className="dv-empty">
          <h2>Nenhuma aula registrada em {monthLabel(month)}</h2>
          <p>Os indicadores aparecem assim que as aulas do período forem fechadas. Aulas anteriores à versão com registro por aula não entram neste cálculo.</p>
        </div>
      ) : (
        <>
          <div className={`dv-kpis ${loading ? "loading" : ""}`}>
            <Kpi label="Adesão" value={fmt(t.adherenceRate)} detail={`${t.adhered} de ${t.people} colaboradores com ao menos 1 presença`} goal={GOALS.adherence} reached={t.adherenceRate >= GOALS.adherence} tone="main" />
            <Kpi label="Presença" value={fmt(t.presentRate)} detail={`${t.present} de ${t.slots} vagas das aulas aplicadas`} />
            <Kpi label="Aulas aplicadas" value={fmt(c.appliedRate)} detail={`${c.applied} de ${c.planned} previstas`} goal={GOALS.applied} reached={c.appliedRate >= GOALS.applied} />
            <Kpi label="Cancelamentos" value={c.cancelled} detail={`${fmt(c.cancelledRate)} das aulas previstas`} />
          </div>
          <section className="dv-card">
            <div className="dv-card-head">
              <div>
                <h2>Como foram as vagas das aulas</h2>
                <p>{t.slots} vagas em {plural(c.applied, "aula aplicada", "aulas aplicadas")}.</p>
              </div>
            </div>
            <SplitBar row={t} tall />
            <ul className="dv-legend">
              <li><i className="p" /> Presença <b>{fmt(t.presentRate)}</b><small>{t.present}</small></li>
              <li><i className="a" /> Ausência <b>{fmt(t.absentRate)}</b><small>{t.absent}</small></li>
              <li><i className="f" /> Falta <b>{fmt(t.missingRate)}</b><small>{t.missing}</small></li>
            </ul>
            <p className="dv-muted">Ausência: o colaborador foi marcado como ausente na aula. Falta: não foi marcado nem como presente nem como ausente.</p>
          </section>
          <Breakdown groups={result.groups} />
          <Collaborators rows={result.collaborators} />
        </>
      )}
    </section>
  );
}
