import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { GOALS } from "./indicators";
import { PERIOD_TYPES, canShift, changePeriodType, shiftPeriod, toIso } from "./periods";
import { ClassesChart, RankingBars, TrendChart } from "./charts";

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

function Breakdown({ groups, field }) {
  const rows = groups[field] || [];
  return (
    <section className="dv-card">
      <div className="dv-card-head">
        <div>
          <h2>Detalhamento por {BREAKDOWNS.find(([key]) => key === field)[1].toLowerCase()}</h2>
          <p>Percentuais sobre as vagas das aulas aplicadas; adesão sobre a lista de colaboradores. Troque o recorte nas abas do gráfico de ranking.</p>
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

// Seletor de período: tipo (Ano, Mês, Trimestre, Semestre, Personalizado) + navegação ou datas.
function PeriodPicker({ period, onPeriod, range }) {
  const today = toIso(new Date());
  const custom = period.type === "custom";
  const setDate = (field) => (event) => onPeriod({ ...period, [field]: event.target.value });
  return (
    <div className="dv-period">
      <div className="dv-seg" role="tablist" aria-label="Tipo de período">
        {PERIOD_TYPES.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={period.type === key} className={period.type === key ? "on" : ""} onClick={() => onPeriod(changePeriodType(period, key))}>{label}</button>
        ))}
      </div>
      {custom ? (
        <div className="dv-dates">
          <label>De <input type="date" value={period.start} max={today} onChange={setDate("start")} /></label>
          <label>Até <input type="date" value={period.end} max={today} onChange={setDate("end")} /></label>
        </div>
      ) : (
        <div className="dv-month">
          <button aria-label="Período anterior" onClick={() => onPeriod(shiftPeriod(period, -1))}><ChevronLeft size={18} /></button>
          <strong>{range.label}</strong>
          <button aria-label="Próximo período" onClick={() => onPeriod(shiftPeriod(period, 1))} disabled={!canShift(period, 1)}><ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  );
}

export default function DashboardView({ result, period, onPeriod, range, ready, loading, error, onRetry, pending, onPdf, filters, truncated }) {
  const [field, setField] = useState("sectorId");
  const t = result.totals;
  const c = result.classes;
  const data = ready && result.hasData;
  const dash = "—";
  return (
    <section className="dv">
      <header className="dv-head">
        <div>
          <p className="eyebrow">INDICADORES</p>
          <h1>Ginástica Laboral</h1>
        </div>
        <div className="dv-head-actions">
          <button className="primary" onClick={onPdf}><FileText size={18} /> Relatório em PDF</button>
        </div>
      </header>
      <PeriodPicker period={period} onPeriod={onPeriod} range={range} />
      {filters}
      {pending > 0 && <p className="dv-note">{plural(pending, "aula aguarda", "aulas aguardam")} envio deste aparelho e ainda não {pending === 1 ? "entrou" : "entraram"} nos indicadores.</p>}
      {truncated && <p className="dv-note">O período tem muitas aulas e a lista foi cortada em 5.000. Escolha um período menor para ver os números completos.</p>}
      {range.error && <p className="dv-note">{range.error}</p>}
      {error ? (
        <div className="dv-empty">
          <h2>Não foi possível carregar os indicadores</h2>
          <p>{error}</p>
          <button className="secondary" onClick={onRetry}><RefreshCw size={16} /> Tentar de novo</button>
        </div>
      ) : (
        <>
          {!range.error && loading && !ready && <p className="dv-note info">Carregando os indicadores de {range.label}…</p>}
          {!range.error && ready && !result.hasData && (
            <p className="dv-note info">Nenhuma aula registrada em {range.label}. Os gráficos se preenchem quando as aulas do período forem fechadas.</p>
          )}
          <div className={`dv-kpis ${loading ? "loading" : ""}`}>
            <Kpi label="Adesão" value={data ? fmt(t.adherenceRate) : dash} detail={data ? `${t.adhered} de ${t.people} colaboradores com ao menos 1 presença` : `${t.people} colaboradores na lista`} goal={data ? GOALS.adherence : null} reached={t.adherenceRate >= GOALS.adherence} tone="main" />
            <Kpi label="Presença" value={data ? fmt(t.presentRate) : dash} detail={data ? `${t.present} de ${t.slots} vagas das aulas aplicadas` : "Sem aulas aplicadas"} />
            <Kpi label="Aulas aplicadas" value={ready ? fmt(c.appliedRate) : dash} detail={`${c.applied} de ${c.planned} previstas`} goal={ready ? GOALS.applied : null} reached={c.appliedRate >= GOALS.applied} />
            <Kpi label="Cancelamentos" value={ready ? c.cancelled : dash} detail={ready ? `${fmt(c.cancelledRate)} das aulas previstas` : "—"} />
          </div>
          <div className={`dv-grid2 ${loading ? "loading" : ""}`}>
            <section className="dv-card">
              <div className="dv-card-head">
                <div>
                  <h2>Evolução da presença e da adesão</h2>
                  <p>Cada ponto é um dia, semana ou mês, conforme o período. Passe o mouse nos pontos para ver os números.</p>
                </div>
              </div>
              <TrendChart series={result.series} />
              <ul className="dv-legend">
                <li><i className="lp" /> Presença</li>
                <li><i className="la" /> Adesão</li>
                <li><i className="lg" /> Meta de adesão</li>
              </ul>
            </section>
            <section className="dv-card">
              <div className="dv-card-head">
                <div>
                  <h2>Aulas previstas × aplicadas</h2>
                  <p>Previstas pela agenda (só até hoje) e aplicadas, fechadas no período.</p>
                </div>
              </div>
              <ClassesChart series={result.series} />
              <ul className="dv-legend">
                <li><i className="bp" /> Previstas</li>
                <li><i className="bd" /> Aplicadas</li>
              </ul>
            </section>
          </div>
          <div className={`dv-grid2 ${loading ? "loading" : ""}`}>
            <section className="dv-card">
              <div className="dv-card-head">
                <div>
                  <h2>Como foram as vagas das aulas</h2>
                  <p>{t.slots} vagas em {plural(c.applied, "aula aplicada", "aulas aplicadas")}.</p>
                </div>
              </div>
              <SplitBar row={t} tall />
              <ul className="dv-legend">
                <li><i className="p" /> Presença <b>{data ? fmt(t.presentRate) : dash}</b><small>{t.present}</small></li>
                <li><i className="a" /> Ausência <b>{data ? fmt(t.absentRate) : dash}</b><small>{t.absent}</small></li>
                <li><i className="f" /> Falta <b>{data ? fmt(t.missingRate) : dash}</b><small>{t.missing}</small></li>
              </ul>
              <p className="dv-muted">Ausência: o colaborador foi marcado como ausente na aula. Falta: não foi marcado nem como presente nem como ausente.</p>
            </section>
            <section className="dv-card">
              <div className="dv-card-head">
                <div>
                  <h2>Presença por recorte</h2>
                  <p>As 8 maiores presenças, sobre as vagas das aulas aplicadas.</p>
                </div>
                <div className="dv-seg" role="tablist" aria-label="Agrupar por">
                  {BREAKDOWNS.map(([key, label]) => (
                    <button key={key} role="tab" aria-selected={field === key} className={field === key ? "on" : ""} onClick={() => setField(key)}>{label}</button>
                  ))}
                </div>
              </div>
              <RankingBars rows={result.groups[field] || []} />
            </section>
          </div>
          {data && <Breakdown groups={result.groups} field={field} />}
          {data && <Collaborators rows={result.collaborators} />}
        </>
      )}
    </section>
  );
}
