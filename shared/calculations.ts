import {
  Vehicle,
  MileageLog,
  MaintenancePlan,
  MaintenanceProjection,
  MaintenanceAlertState,
  Contract,
  Installment,
  SystemSettings,
  MonthEndRule,
} from './types';

/**
 * Parses an ISO date string (YYYY-MM-DD) into a UTC midnight Date object
 * to avoid timezone shifts across calculations.
 */
export function parseISODate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatBRDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatCurrencyBRL(cents?: number | null): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return 'R$ 0,00';
  const value = cents / 100;
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function daysBetween(startIso: string, endIso: string): number {
  const d1 = parseISODate(startIso);
  const d2 = parseISODate(endIso);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function addDays(isoDate: string, days: number): string {
  const d = parseISODate(isoDate);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return formatISODate(d);
}

export function addMonthsWithRule(
  isoDate: string,
  monthsToAdd: number,
  targetDay?: number | null,
  rule: MonthEndRule = 'ultimo_dia_valido'
): string {
  const d = parseISODate(isoDate);
  const originalDay = targetDay || d.getUTCDate();
  const targetYear = d.getUTCFullYear();
  const targetMonthIndex = d.getUTCMonth() + monthsToAdd;

  // Last day of the target month
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();

  if (originalDay <= lastDayOfTargetMonth) {
    return formatISODate(new Date(Date.UTC(targetYear, targetMonthIndex, originalDay)));
  }

  // Day doesn't exist in target month (e.g., 31st in Feb/Apr)
  if (rule === 'proximo_dia_util') {
    // Moves to first business day of next month
    const nextMonthFirst = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 1));
    const dow = nextMonthFirst.getUTCDay();
    if (dow === 6) nextMonthFirst.setUTCDate(3); // Saturday -> Monday
    if (dow === 0) nextMonthFirst.setUTCDate(2); // Sunday -> Monday
    return formatISODate(nextMonthFirst);
  }

  // Default: 'ultimo_dia_valido'
  return formatISODate(new Date(Date.UTC(targetYear, targetMonthIndex, lastDayOfTargetMonth)));
}

/**
 * Calculates the real daily mileage average from odometer reading history.
 * Formula: (latestKm - earliestKm) / daysBetween(earliestDate, latestDate)
 * Also returns the most recent pair average if needed.
 */
export function calculateHistoricalDailyKmAvg(logs: MileageLog[]): number | null {
  if (!logs || logs.length < 2) return null;

  // Sort ascending by date, then by km
  const sorted = [...logs].sort((a, b) => {
    const dateDiff = a.readingDate.localeCompare(b.readingDate);
    if (dateDiff !== 0) return dateDiff;
    return a.km - b.km;
  });

  // Use the two most recent distinct-date readings first, or overall span if same day
  for (let i = sorted.length - 1; i >= 1; i--) {
    const latest = sorted[i];
    const prev = sorted[i - 1];
    const days = daysBetween(prev.readingDate, latest.readingDate);
    const kmDiff = latest.km - prev.km;
    if (days > 0 && kmDiff >= 0) {
      return Math.round((kmDiff / days) * 100) / 100;
    }
  }

  // Fallback to first and last reading
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalDays = daysBetween(first.readingDate, last.readingDate);
  const totalKm = last.km - first.km;
  if (totalDays > 0 && totalKm >= 0) {
    return Math.round((totalKm / totalDays) * 100) / 100;
  }

  return null;
}

/**
 * Resolves the active daily mileage average for a vehicle based on administrator choice
 * ('manual' vs 'calculated'). Never invents a default number.
 */
export function getActiveDailyKmAvg(vehicle: Vehicle, logs: MileageLog[]): number | null {
  if (vehicle.avgCalculationMode === 'calculated') {
    const calculated = calculateHistoricalDailyKmAvg(logs);
    if (calculated !== null) return calculated;
    return vehicle.manualDailyKmAvg;
  }
  return vehicle.manualDailyKmAvg;
}

/**
 * Projects the current estimated mileage of a vehicle on a reference date (today),
 * without ever overwriting the real odometer reading stored on the vehicle.
 */
export function calculateProjectedKm(
  vehicle: Vehicle,
  logs: MileageLog[],
  referenceDateIso: string
): { projectedKm: number; activeDailyAvg: number | null; daysSinceLastReading: number } {
  const activeDailyAvg = getActiveDailyKmAvg(vehicle, logs);
  const daysSince = Math.max(0, daysBetween(vehicle.lastKmUpdateDate, referenceDateIso));

  if (activeDailyAvg === null || activeDailyAvg <= 0) {
    return {
      projectedKm: vehicle.currentKm,
      activeDailyAvg,
      daysSinceLastReading: daysSince,
    };
  }

  const projectedKm = Math.round(vehicle.currentKm + daysSince * activeDailyAvg);
  return {
    projectedKm,
    activeDailyAvg,
    daysSinceLastReading: daysSince,
  };
}

/**
 * Complete Preventive Maintenance Calculation Engine (Section 4):
 * A. Next maintenance (km) = lastMaintenanceKm + intervalKm
 * B. Remaining km = nextMaintenanceKm - projectedCurrentKm
 * C. Remaining days = remainingKm / activeDailyKmAvg
 * D. Estimated date = referenceDate + remainingDays
 * Also evaluates time-based intervals (days or months) if configured, picking whichever occurs first.
 * Never invents dates when data is missing — returns "indisponivel" and lists missing fields.
 */
export function calculateMaintenanceProjection(
  plan: MaintenancePlan,
  vehicle: Vehicle,
  logs: MileageLog[],
  referenceDateIso: string,
  settings?: Pick<SystemSettings, 'alertMaintenanceKmBefore' | 'alertMaintenanceDaysBefore'>
): MaintenanceProjection {
  const { projectedKm, activeDailyAvg } = calculateProjectedKm(vehicle, logs, referenceDateIso);
  const missingDataReasons: string[] = [];

  // 1. Mileage-based calculation
  let nextMaintenanceKm: number | null = null;
  let remainingKm: number | null = null;
  let remainingDaysByKm: number | null = null;
  let estimatedDateByKm: string | null = null;

  const hasKmInterval = plan.intervalKm !== null && plan.intervalKm !== undefined && plan.intervalKm > 0;

  if (hasKmInterval) {
    if (plan.lastMaintenanceKm === null || plan.lastMaintenanceKm === undefined) {
      missingDataReasons.push('Quilometragem da última manutenção não informada');
    } else {
      nextMaintenanceKm = plan.lastMaintenanceKm + plan.intervalKm!;
      remainingKm = nextMaintenanceKm - projectedKm;

      if (activeDailyAvg !== null && activeDailyAvg > 0) {
        // Exact days remaining (e.g. 5000 / 100 = 50 days)
        remainingDaysByKm = Math.ceil(remainingKm / activeDailyAvg);
        estimatedDateByKm = addDays(referenceDateIso, remainingDaysByKm);
      } else {
        missingDataReasons.push('Média diária de km não configurada ou igual a zero');
      }
    }
  }

  // 2. Time-based calculation (days or months)
  let estimatedDateByTime: string | null = null;
  let remainingDaysByTime: number | null = null;

  const hasDaysInterval = plan.intervalDays !== null && plan.intervalDays !== undefined && plan.intervalDays > 0;
  const hasMonthsInterval = plan.intervalMonths !== null && plan.intervalMonths !== undefined && plan.intervalMonths > 0;

  if (hasDaysInterval || hasMonthsInterval) {
    if (!plan.lastMaintenanceDate) {
      missingDataReasons.push('Data da última manutenção não informada');
    } else {
      if (hasDaysInterval) {
        estimatedDateByTime = addDays(plan.lastMaintenanceDate, plan.intervalDays!);
      } else if (hasMonthsInterval) {
        estimatedDateByTime = addMonthsWithRule(plan.lastMaintenanceDate, plan.intervalMonths!);
      }
      if (estimatedDateByTime) {
        remainingDaysByTime = daysBetween(referenceDateIso, estimatedDateByTime);
      }
    }
  }

  if (!hasKmInterval && !hasDaysInterval && !hasMonthsInterval) {
    missingDataReasons.push('Nenhum intervalo de quilometragem ou tempo configurado');
  }

  // 3. Determine limiting criterion (whichever comes first: km or time)
  let limitingCriterion: 'km' | 'tempo' | 'indisponivel' = 'indisponivel';
  let effectiveRemainingDays: number | null = null;
  let effectiveEstimatedDate: string | null = null;

  if (remainingDaysByKm !== null && remainingDaysByTime !== null) {
    if (remainingDaysByKm <= remainingDaysByTime) {
      limitingCriterion = 'km';
      effectiveRemainingDays = remainingDaysByKm;
      effectiveEstimatedDate = estimatedDateByKm;
    } else {
      limitingCriterion = 'tempo';
      effectiveRemainingDays = remainingDaysByTime;
      effectiveEstimatedDate = estimatedDateByTime;
    }
  } else if (remainingDaysByKm !== null) {
    limitingCriterion = 'km';
    effectiveRemainingDays = remainingDaysByKm;
    effectiveEstimatedDate = estimatedDateByKm;
  } else if (remainingDaysByTime !== null) {
    limitingCriterion = 'tempo';
    effectiveRemainingDays = remainingDaysByTime;
    effectiveEstimatedDate = estimatedDateByTime;
  } else if (remainingKm !== null) {
    // Even if daily average is 0 (so date cannot be estimated), we still know remainingKm!
    limitingCriterion = 'km';
  }

  // 4. Determine Alert Status ('em_dia' | 'proxima' | 'vencida' | 'indisponivel')
  const alertKmThreshold =
    plan.customAlertKmBefore !== null && plan.customAlertKmBefore !== undefined
      ? plan.customAlertKmBefore
      : settings?.alertMaintenanceKmBefore ?? null;

  const alertDaysThreshold =
    plan.customAlertDaysBefore !== null && plan.customAlertDaysBefore !== undefined
      ? plan.customAlertDaysBefore
      : settings?.alertMaintenanceDaysBefore ?? null;

  let status: MaintenanceAlertState = 'indisponivel';

  const isOverdueByKm = remainingKm !== null && remainingKm <= 0;
  const isOverdueByTime = remainingDaysByTime !== null && remainingDaysByTime <= 0;
  const isOverdueByDays = effectiveRemainingDays !== null && effectiveRemainingDays <= 0;

  if (isOverdueByKm || isOverdueByTime || isOverdueByDays) {
    status = 'vencida';
  } else if (remainingKm !== null || effectiveRemainingDays !== null) {
    const isNearByKm =
      remainingKm !== null && alertKmThreshold !== null && alertKmThreshold >= 0 && remainingKm <= alertKmThreshold;
    const isNearByDays =
      effectiveRemainingDays !== null &&
      alertDaysThreshold !== null &&
      alertDaysThreshold >= 0 &&
      effectiveRemainingDays <= alertDaysThreshold;

    if (isNearByKm || isNearByDays) {
      status = 'proxima';
    } else {
      status = 'em_dia';
    }
  }

  return {
    planId: plan.id,
    vehicleId: plan.vehicleId,
    activeDailyKmAvg: activeDailyAvg,
    projectedCurrentKm: projectedKm,
    nextMaintenanceKm,
    remainingKm,
    remainingDaysByKm,
    estimatedDateByKm,
    estimatedDateByTime,
    remainingDaysByTime,
    effectiveRemainingDays,
    effectiveEstimatedDate,
    limitingCriterion,
    missingDataReasons,
    status,
  };
}

/**
 * Generates recurring due dates for a contract (Section 5 & Section 8).
 * Supports:
 * - 'semanal': specific day of week (0=Sunday .. 6=Saturday)
 * - 'quinzenal': every 15 days from initial billing date
 * - 'mensal': specific day of month (1..31) with configurable month-end rule
 * - 'personalizado': every N custom days
 */
export function generateContractDueDates(
  contract: Pick<
    Contract,
    | 'startDate'
    | 'endDate'
    | 'isIndefinite'
    | 'frequency'
    | 'weeklyDay'
    | 'monthlyDay'
    | 'customIntervalDays'
    | 'monthEndRule'
    | 'firstDueDate'
    | 'indefiniteWindowDays'
  >,
  referenceDateIso: string
): string[] {
  const dates: string[] = [];

  // Determine the end horizon for generating installments
  let horizonDateIso: string | null = contract.endDate;
  if (contract.isIndefinite || !horizonDateIso) {
    if (!contract.indefiniteWindowDays || contract.indefiniteWindowDays <= 0) {
      // Do not generate arbitrary window if not configured
      if (contract.firstDueDate) {
        return [contract.firstDueDate];
      }
      return [];
    }
    const baseForWindow = referenceDateIso > contract.startDate ? referenceDateIso : contract.startDate;
    horizonDateIso = addDays(baseForWindow, contract.indefiniteWindowDays);
  }

  if (horizonDateIso < contract.startDate) return [];

  if (contract.frequency === 'semanal') {
    const targetDow =
      contract.weeklyDay !== null && contract.weeklyDay !== undefined
        ? contract.weeklyDay
        : parseISODate(contract.firstDueDate || contract.startDate).getUTCDay();

    let current = parseISODate(contract.firstDueDate || contract.startDate);
    // Align to first matching day of week on or after startDate
    while (current.getUTCDay() !== targetDow) {
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const end = parseISODate(horizonDateIso);
    while (current.getTime() <= end.getTime()) {
      dates.push(formatISODate(current));
      current.setUTCDate(current.getUTCDate() + 7);
    }
  } else if (contract.frequency === 'quinzenal') {
    let currentIso = contract.firstDueDate || addDays(contract.startDate, 15);
    while (currentIso <= horizonDateIso) {
      dates.push(currentIso);
      currentIso = addDays(currentIso, 15);
    }
  } else if (contract.frequency === 'mensal') {
    const startObj = parseISODate(contract.firstDueDate || contract.startDate);
    const targetDay =
      contract.monthlyDay !== null && contract.monthlyDay !== undefined
        ? contract.monthlyDay
        : startObj.getUTCDate();

    let monthOffset = 0;
    // Check first month candidate
    let candidateIso = addMonthsWithRule(
      formatISODate(new Date(Date.UTC(startObj.getUTCFullYear(), startObj.getUTCMonth(), 1))),
      0,
      targetDay,
      contract.monthEndRule
    );

    if (candidateIso < contract.startDate) {
      monthOffset = 1;
      candidateIso = addMonthsWithRule(
        formatISODate(new Date(Date.UTC(startObj.getUTCFullYear(), startObj.getUTCMonth(), 1))),
        monthOffset,
        targetDay,
        contract.monthEndRule
      );
    }

    const baseFirstOfMonth = formatISODate(new Date(Date.UTC(startObj.getUTCFullYear(), startObj.getUTCMonth(), 1)));
    while (candidateIso <= horizonDateIso && dates.length < 240) {
      dates.push(candidateIso);
      monthOffset += 1;
      candidateIso = addMonthsWithRule(baseFirstOfMonth, monthOffset, targetDay, contract.monthEndRule);
    }
  } else if (contract.frequency === 'personalizado') {
    const interval = contract.customIntervalDays;
    if (!interval || interval <= 0) return [];
    let currentIso = contract.firstDueDate || addDays(contract.startDate, interval);
    while (currentIso <= horizonDateIso && dates.length < 500) {
      dates.push(currentIso);
      currentIso = addDays(currentIso, interval);
    }
  }

  return dates;
}

/**
 * Calculates the net due amount of an installment in cents:
 * expectedAmountCents - discountCents + surchargeCents
 */
export function getInstallmentNetTotalCents(
  inst: Pick<Installment, 'expectedAmountCents' | 'discountCents' | 'surchargeCents'>
): number {
  return Math.max(0, inst.expectedAmountCents - (inst.discountCents || 0) + (inst.surchargeCents || 0));
}

/**
 * Calculates the remaining open balance of an installment in cents.
 * Preserves remaining balance when partial payments occur (Rule 14).
 */
export function getInstallmentOpenBalanceCents(
  inst: Pick<Installment, 'expectedAmountCents' | 'discountCents' | 'surchargeCents' | 'paidAmountCents' | 'status'>
): number {
  if (inst.status === 'cancelada' || inst.status === 'paga') return 0;
  const net = getInstallmentNetTotalCents(inst);
  return Math.max(0, net - (inst.paidAmountCents || 0));
}

/**
 * Evaluates the current status of an installment (Rule 13 & Rule 14):
 * - Never marks an installment as paid just because its due date passed.
 * - Differentiates 'paga', 'parcialmente_paga', 'vencida', 'pendente', and 'cancelada'.
 */
export function evaluateInstallmentStatus(
  inst: Pick<
    Installment,
    'expectedAmountCents' | 'discountCents' | 'surchargeCents' | 'paidAmountCents' | 'dueDate' | 'status'
  >,
  referenceDateIso: string
): Installment['status'] {
  if (inst.status === 'cancelada') return 'cancelada';

  const net = getInstallmentNetTotalCents(inst);
  const paid = inst.paidAmountCents || 0;

  if (paid >= net && net > 0) {
    return 'paga';
  }
  if (paid > 0 && paid < net) {
    // Even if overdue, partial payment is tracked clearly; if past dueDate and still has balance,
    // we keep 'parcialmente_paga' as primary status while open balance is flagged if overdue.
    return 'parcialmente_paga';
  }
  if (inst.dueDate < referenceDateIso) {
    return 'vencida';
  }
  return 'pendente';
}

/**
 * Checks if two contracts for the same vehicle have overlapping active periods (Section 8).
 */
export function hasContractPeriodConflict(
  existingContracts: Contract[],
  candidate: {
    id?: string;
    vehicleId: string;
    startDate: string;
    endDate: string | null;
    isIndefinite: boolean;
    status: Contract['status'];
  }
): Contract | null {
  if (candidate.status !== 'ativo') return null;

  const candStart = candidate.startDate;
  const candEnd = candidate.isIndefinite || !candidate.endDate ? '9999-12-31' : candidate.endDate;

  for (const existing of existingContracts) {
    if (existing.id === candidate.id) continue;
    if (existing.vehicleId !== candidate.vehicleId) continue;
    if (existing.status !== 'ativo') continue;

    const exStart = existing.startDate;
    const exEnd = existing.isIndefinite || !existing.endDate ? '9999-12-31' : existing.endDate;

    // Overlap condition: startA <= endB && startB <= endA
    if (candStart <= exEnd && exStart <= candEnd) {
      return existing;
    }
  }
  return null;
}

