// Matrícula de colaborador: única por empresa, sem diferença de caixa nem de espaços nas pontas.
export const registrationKey = (clientId, registration) => `${clientId}|${String(registration ?? "").trim().toLowerCase()}`;

// Colaborador que já usa a matrícula na empresa (ignora o próprio registro em edição).
export function findRegistrationOwner(people, clientId, registration, ignoreId) {
  if (!String(registration ?? "").trim()) return undefined;
  const key = registrationKey(clientId, registration);
  return people.find((person) => person.id !== ignoreId && registrationKey(person.clientId, person.registration) === key);
}

// Confere uma linha de colaborador da planilha e devolve o motivo em português ("" se estiver correta).
// seen: mapa matrícula -> linha, preenchido aqui para achar repetição dentro da própria planilha.
export function checkPersonRow({ registration, turn, names, company, unit, sector, location, people, seen, line }) {
  if (!registration) return "Matrícula ou CPF não informada.";
  if (!company) return `Empresa "${names.company}" não cadastrada.`;
  if (!unit) return names.unit ? `Unidade "${names.unit}" não encontrada na empresa ${company.name}.` : "Unidade não informada.";
  if (!sector) return names.sector ? `Setor "${names.sector}" não encontrado na unidade ${unit.name}.` : "Setor não informado.";
  if (!location) return names.location ? `Local da aula "${names.location}" não encontrado na unidade ${unit.name}.` : "Local da aula não informado.";
  if (!turn) return "Turno não informado.";
  const owner = findRegistrationOwner(people, company.id, registration);
  if (owner) return `Matrícula ${registration} já cadastrada nesta empresa (${owner.name?.trim() || "colaborador sem nome"}).`;
  const key = registrationKey(company.id, registration);
  if (seen.has(key)) return `Matrícula ${registration} repetida na planilha (também na linha ${seen.get(key)}).`;
  seen.set(key, line);
  return "";
}
