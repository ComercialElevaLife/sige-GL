import { plannedClassesForRange } from "./scheduling";
import { MONTH_NAMES, toIso } from "./periods";

// Indicadores do período, calculados a partir das aulas e das presenças registradas por aula.
// Definições (para o período escolhido: ano, mês, trimestre, semestre ou intervalo):
// - Presença, ausência e falta: % sobre as vagas (uma vaga = um colaborador da lista de uma aula aplicada).
// - Adesão: % dos colaboradores da lista com ao menos uma presença no período.
// - Participação (aulas aplicadas): aulas aplicadas ÷ aulas previstas na agenda do período, contando só até hoje.
export const GOALS = { adherence: 75, applied: 90 };

const pct = (value, total) => (total ? (value / total) * 100 : 0);

export const currentMonth = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function monthRange(month) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(year, number - 1, 1);
  const next = new Date(year, number, 1);
  return { from: first.toISOString(), to: next.toISOString(), reference: first };
}

export function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  const text = new Date(year, number - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const matchesAula = (aula, filter) =>
  (!filter.clientId || aula.clientId === filter.clientId) &&
  (!filter.unitId || aula.unitId === filter.unitId) &&
  (!filter.sectorId || aula.sectorId === filter.sectorId) &&
  (!filter.shift || aula.shift === filter.shift) &&
  (!filter.locationId || aula.locationId === filter.locationId);

const emptyCounts = () => ({ slots: 0, present: 0, absent: 0, missing: 0 });
const add = (target, status) => {
  target.slots += 1;
  if (status === "present") target.present += 1;
  else if (status === "absent") target.absent += 1;
  else target.missing += 1;
};
const withRates = (row) => ({
  ...row,
  presentRate: pct(row.present, row.slots),
  absentRate: pct(row.absent, row.slots),
  missingRate: pct(row.missing, row.slots),
  adherenceRate: pct(row.adhered ?? 0, row.people ?? 0),
});

const DAY = 24 * 3600 * 1000;
const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
const dm = (date) => `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

// Divide o período (até hoje) em colunas: dias (até 14 dias), semanas (até ~2 meses) ou meses.
export function buildBuckets(range, today = new Date()) {
  const end = new Date(Math.min(range.to.getTime(), addDays(dayStart(today), 1).getTime()));
  if (!(end > range.from)) return [];
  const days = Math.round((end - range.from) / DAY);
  const mode = days <= 14 ? "day" : days <= 62 ? "week" : "month";
  const crossesYear = range.from.getFullYear() !== addDays(end, -1).getFullYear();
  const buckets = [];
  let cursor = range.from;
  while (cursor < end) {
    let next;
    if (mode === "day") next = addDays(cursor, 1);
    else if (mode === "week") next = addDays(cursor, ((8 - cursor.getDay()) % 7) || 7);
    else next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    if (next > end) next = end;
    const last = addDays(next, -1);
    const name = MONTH_NAMES[cursor.getMonth()];
    buckets.push({
      key: toIso(cursor),
      from: cursor,
      to: next,
      label: mode === "month" ? `${name.slice(0, 3)}${crossesYear ? `/${String(cursor.getFullYear()).slice(2)}` : ""}` : dm(cursor),
      fullLabel: mode === "month" ? `${name} de ${cursor.getFullYear()}` : mode === "day" || last <= cursor ? dm(cursor) : `${dm(cursor)} a ${dm(last)}`,
    });
    cursor = next;
  }
  return buckets;
}

// people: colaboradores ativos já filtrados pelo recorte; labels: { clients, units, sectors } com { id, name }.
export function computeIndicators({ aulas = [], presencas = [], people = [], schedules = [], filter = {}, period, today = new Date(), labels = {} }) {
  const range = period;
  const inScope = aulas.filter((aula) => matchesAula(aula, filter));
  const applied = inScope.filter((aula) => aula.status === "applied");
  const cancelled = inScope.filter((aula) => aula.status === "cancelled");
  const appliedById = new Map(applied.map((aula) => [aula.id, aula]));
  const buckets = buildBuckets(range, today);
  const effectiveEnd = buckets.length ? buckets[buckets.length - 1].to : range.from;
  const planned = plannedClassesForRange(schedules, filter, range.from, effectiveEnd);
  const bucketOf = (aula) => {
    const time = new Date(aula.closedAt).getTime();
    return buckets.findIndex((bucket) => time >= bucket.from.getTime() && time < bucket.to.getTime());
  };
  const bucketCounts = buckets.map(() => ({ applied: 0, cancelled: 0, slots: 0, present: 0, adhered: new Set() }));
  const aulaBucket = new Map();
  for (const aula of inScope) {
    const index = bucketOf(aula);
    if (index < 0) continue;
    aulaBucket.set(aula.id, index);
    if (aula.status === "applied") bucketCounts[index].applied += 1;
    else if (aula.status === "cancelled") bucketCounts[index].cancelled += 1;
  }

  const total = emptyCounts();
  const personCounts = new Map();
  const groupCounts = { clientId: new Map(), unitId: new Map(), sectorId: new Map(), shift: new Map() };
  const adheredPeople = new Set();

  for (const row of presencas) {
    const aula = appliedById.get(row.aulaId);
    if (!aula) continue;
    add(total, row.status);
    if (row.status === "present") adheredPeople.add(row.personId);
    const index = aulaBucket.get(row.aulaId);
    if (index != null) {
      bucketCounts[index].slots += 1;
      if (row.status === "present") {
        bucketCounts[index].present += 1;
        bucketCounts[index].adhered.add(row.personId);
      }
    }
    if (!personCounts.has(row.personId)) personCounts.set(row.personId, emptyCounts());
    add(personCounts.get(row.personId), row.status);
    for (const field of Object.keys(groupCounts)) {
      const key = aula[field] || "—";
      if (!groupCounts[field].has(key)) groupCounts[field].set(key, emptyCounts());
      add(groupCounts[field].get(key), row.status);
    }
  }

  const peopleIds = new Set(people.map((person) => person.id));
  const adhered = [...adheredPeople].filter((id) => peopleIds.has(id)).length;

  const nameFrom = (list, id) => list?.find((item) => item.id === id)?.name || id;
  const groupLabel = { clientId: (id) => nameFrom(labels.clients, id), unitId: (id) => nameFrom(labels.units, id), sectorId: (id) => nameFrom(labels.sectors, id), shift: (id) => id };
  const groups = {};
  for (const field of Object.keys(groupCounts)) {
    const basePeople = new Map();
    for (const person of people) {
      const key = person[field] || "—";
      if (!basePeople.has(key)) basePeople.set(key, { people: 0, adhered: 0 });
      const entry = basePeople.get(key);
      entry.people += 1;
      if (adheredPeople.has(person.id)) entry.adhered += 1;
    }
    const keys = new Set([...groupCounts[field].keys(), ...basePeople.keys()]);
    groups[field] = [...keys]
      .map((key) => withRates({ key, label: groupLabel[field](key), ...emptyCounts(), ...(groupCounts[field].get(key) || {}), people: basePeople.get(key)?.people || 0, adhered: basePeople.get(key)?.adhered || 0 }))
      .sort((a, b) => b.presentRate - a.presentRate || a.label.localeCompare(b.label, "pt-BR"));
  }

  const collaborators = people
    .map((person) => ({ person, ...emptyCounts(), ...(personCounts.get(person.id) || {}) }))
    .map((row) => ({ ...row, presentRate: pct(row.present, row.slots), absentRate: pct(row.absent, row.slots), missingRate: pct(row.missing, row.slots) }))
    .sort((a, b) => (a.slots ? 0 : 1) - (b.slots ? 0 : 1) || a.presentRate - b.presentRate || (a.person.name || "").localeCompare(b.person.name || "", "pt-BR"));

  const series = buckets.map((bucket, index) => {
    const counts = bucketCounts[index];
    const adheredNow = [...counts.adhered].filter((id) => peopleIds.has(id)).length;
    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      applied: counts.applied,
      cancelled: counts.cancelled,
      planned: plannedClassesForRange(schedules, filter, bucket.from, bucket.to),
      slots: counts.slots,
      present: counts.present,
      presentRate: pct(counts.present, counts.slots),
      adherenceRate: pct(adheredNow, people.length),
      hasSlots: counts.slots > 0,
      hasData: counts.applied + counts.cancelled > 0,
    };
  });

  return {
    periodLabel: range.label,
    series,
    classes: { applied: applied.length, cancelled: cancelled.length, planned, appliedRate: pct(applied.length, planned), cancelledRate: pct(cancelled.length, planned) },
    totals: withRates({ ...total, people: people.length, adhered }),
    groups,
    collaborators,
    hasData: applied.length + cancelled.length > 0,
  };
}
