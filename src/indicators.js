import { plannedClassesForMonth } from "./scheduling";

// Indicadores do período, calculados a partir das aulas e das presenças registradas por aula.
// Definições (por mês):
// - Presença, ausência e falta: % sobre as vagas (uma vaga = um colaborador da lista de uma aula aplicada).
// - Adesão: % dos colaboradores da lista com ao menos uma presença no período.
// - Participação (aulas aplicadas): aulas aplicadas ÷ aulas previstas na agenda do mês.
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

// people: colaboradores ativos já filtrados pelo recorte; labels: { clients, units, sectors } com { id, name }.
export function computeIndicators({ aulas = [], presencas = [], people = [], schedules = [], filter = {}, month, labels = {} }) {
  const { reference } = monthRange(month);
  const inScope = aulas.filter((aula) => matchesAula(aula, filter));
  const applied = inScope.filter((aula) => aula.status === "applied");
  const cancelled = inScope.filter((aula) => aula.status === "cancelled");
  const appliedById = new Map(applied.map((aula) => [aula.id, aula]));
  const planned = plannedClassesForMonth(schedules, filter, reference);

  const total = emptyCounts();
  const personCounts = new Map();
  const groupCounts = { clientId: new Map(), unitId: new Map(), sectorId: new Map(), shift: new Map() };
  const adheredPeople = new Set();

  for (const row of presencas) {
    const aula = appliedById.get(row.aulaId);
    if (!aula) continue;
    add(total, row.status);
    if (row.status === "present") adheredPeople.add(row.personId);
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

  return {
    month,
    classes: { applied: applied.length, cancelled: cancelled.length, planned, appliedRate: pct(applied.length, planned), cancelledRate: pct(cancelled.length, planned) },
    totals: withRates({ ...total, people: people.length, adhered }),
    groups,
    collaborators,
    hasData: applied.length + cancelled.length > 0,
  };
}
