export const weekdays = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
];

export function plannedClassesForMonth(schedules, filters = {}, reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  return schedules
    .filter((schedule) =>
      (!filters.clientId || schedule.clientId === filters.clientId) &&
      (!filters.unitId || schedule.unitId === filters.unitId) &&
      (!filters.sectorId || schedule.sectorId === filters.sectorId) &&
      (!filters.shift || schedule.shift === filters.shift) &&
      (!filters.locationId || schedule.locationId === filters.locationId),
    )
    .reduce((total, schedule) => {
      let count = 0;
      for (let day = 1; day <= days; day += 1) {
        if (new Date(year, month, day).getDay() === Number(schedule.weekday)) count += 1;
      }
      return total + count;
    }, 0);
}
