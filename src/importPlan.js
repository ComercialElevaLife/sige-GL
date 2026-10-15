import { checkPersonRow } from "./registry";

const norm = (value) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

// Planeja a importação de colaboradores: confere cada linha e, se createMissing estiver ligado,
// prevê a criação de unidade, setor e local que ainda não existem (a empresa precisa estar cadastrada).
// Só entram em "created" os itens usados por linhas válidas; ids novos são gerados por newid.
export function planPeopleImport({ rows, cell, data, createMissing, newid }) {
  const seen = new Map();
  const planned = { units: new Map(), sectors: new Map(), locations: new Map() };
  const text = (row, name) => String(cell(row, name) ?? "").trim();
  const ensure = (bucket, key, make) => {
    if (!planned[bucket].has(key)) planned[bucket].set(key, make());
    return planned[bucket].get(key);
  };

  const items = rows.map((row, index) => {
    const names = { company: text(row, "Empresa"), unit: text(row, "Unidade"), sector: text(row, "Setor"), location: text(row, "Local da aula") };
    const company = data.clients.find((item) => norm(item.name) === norm(names.company));
    let unit = company && data.units.find((item) => item.clientId === company.id && norm(item.name) === norm(names.unit));
    let sector = unit && data.sectors.find((item) => item.unitId === unit.id && norm(item.name) === norm(names.sector));
    let location = unit && data.locations.find((item) => item.unitId === unit.id && norm(item.name) === norm(names.location));
    if (createMissing && company) {
      if (!unit && names.unit) unit = ensure("units", `${company.id}|${norm(names.unit)}`, () => ({ id: newid("UNI"), clientId: company.id, name: names.unit }));
      if (unit && !sector && names.sector) sector = ensure("sectors", `${unit.id}|${norm(names.sector)}`, () => ({ id: newid("SET"), unitId: unit.id, name: names.sector }));
      if (unit && !location && names.location) location = ensure("locations", `${unit.id}|${norm(names.location)}`, () => ({ id: newid("LOC"), clientId: company.id, unitId: unit.id, name: names.location }));
    }
    const error = checkPersonRow({
      registration: text(row, "Matrícula ou CPF"),
      turn: text(row, "Turno"),
      names, company, unit, sector, location, people: data.people, seen, line: index + 2,
    });
    return { row, index: index + 2, error, company, unit, sector, location };
  });

  const ready = items.filter((item) => !item.error);
  const used = (field) => new Set(ready.map((item) => item[field]?.id));
  const usedUnits = used("unit"), usedSectors = used("sector"), usedLocations = used("location");
  const created = {
    units: [...planned.units.values()].filter((item) => usedUnits.has(item.id)),
    sectors: [...planned.sectors.values()].filter((item) => usedSectors.has(item.id)),
    locations: [...planned.locations.values()].filter((item) => usedLocations.has(item.id)),
  };
  return { rows: items, ready: ready.length, rejected: items.length - ready.length, created };
}
