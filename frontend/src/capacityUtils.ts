import type { CapacityMember, CapacitySprint, CapacityState } from './types';

export function businessDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 0;
  let result = 0;
  for (let current = start; current <= end; current = new Date(current.getTime() + 86400000)) {
    if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) result += 1;
  }
  return result;
}

export function officeWorkdays(member: CapacityMember, sprint: CapacitySprint): number {
  const holidays = member.office === 'cyprus' ? sprint.holidayDaysCyprus : sprint.holidayDaysBeirut;
  return Math.max(0, businessDays(sprint.startDate, sprint.endDate) - holidays);
}

export function sprintCapacity(member: CapacityMember, sprint: CapacitySprint, defaults: CapacityState['defaults']) {
  const availability = Math.max(0, Math.min(366, Number(sprint.availabilityDays[member.id] ?? officeWorkdays(member, sprint))));
  const devPct = Math.max(0, member.trainStaffDevCapacityPct - defaults.ceremoniesPct);
  const featureGross = devPct * availability * defaults.featureCapacityPct;
  const codeReview = featureGross * defaults.codeReviewPct;
  const support = devPct * availability * defaults.supportCapacityPct;
  return { availability, devPct, feature: featureGross - codeReview, codeReview, support, total: featureGross + support };
}

export function sprintFeatureCapacity(capacity: CapacityState, sprint: CapacitySprint): number {
  return capacity.members.reduce((total, member) => total + sprintCapacity(member, sprint, capacity.defaults).feature, 0);
}
