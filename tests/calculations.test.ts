import { describe, it, expect } from 'vitest';
import {
  calculateHistoricalDailyKmAvg,
  calculateProjectedKm,
  calculateMaintenanceProjection,
  generateContractDueDates,
  getInstallmentOpenBalanceCents,
  evaluateInstallmentStatus,
  hasContractPeriodConflict,
  addMonthsWithRule,
} from '../shared/calculations';
import { Vehicle, MileageLog, MaintenancePlan, Contract } from '../shared/types';

describe('1. Cálculos de Quilometragem e Manutenção Preventiva', () => {
  const baseVehicle: Vehicle = {
    id: 'v1',
    brand: 'Renault',
    model: 'Kangoo',
    manufacturingYear: 2023,
    modelYear: 2024,
    plate: 'JK-789-LM',
    color: 'Branco',
    status: 'disponivel',
    currentKm: 45000,
    lastKmUpdateDate: '2026-11-11',
    manualDailyKmAvg: 100,
    avgCalculationMode: 'manual',
    createdAt: '2026-11-11T00:00:00Z',
    updatedAt: '2026-11-11T00:00:00Z',
  };

  it('deve calcular exatamente o exemplo demonstrativo da seção 4 (45.000 km, 100 km/dia, última 42.000 km, intervalo 8.000 km)', () => {
    const plan: MaintenancePlan = {
      id: 'p1',
      vehicleId: 'v1',
      name: 'Troca de óleo do motor',
      category: 'Motor',
      components: ['Óleo do motor'],
      lastMaintenanceKm: 42000,
      lastMaintenanceDate: '2026-10-01',
      intervalKm: 8000,
      intervalDays: null,
      intervalMonths: null,
      estimatedCostCents: 25000,
      customAlertKmBefore: 1000,
      customAlertDaysBefore: 10,
      createdAt: '2026-11-11T00:00:00Z',
      updatedAt: '2026-11-11T00:00:00Z',
    };

    const projection = calculateMaintenanceProjection(plan, baseVehicle, [], '2026-11-11');
    expect(projection.nextMaintenanceKm).toBe(50000);
    expect(projection.remainingKm).toBe(5000);
    expect(projection.remainingDaysByKm).toBe(50);
    expect(projection.effectiveEstimatedDate).toBe('2026-12-31'); // 50 days after 2026-11-11
    expect(projection.status).toBe('em_dia');
  });

  it('deve recalcular imediatamente quando a média diária mudar e nunca sobrescrever a quilometragem real', () => {
    const vehicleUpdated: Vehicle = {
      ...baseVehicle,
      lastKmUpdateDate: '2026-11-01', // 10 days before reference date 2026-11-11
      manualDailyKmAvg: 120,
    };

    const { projectedKm } = calculateProjectedKm(vehicleUpdated, [], '2026-11-11');
    expect(projectedKm).toBe(45000 + 10 * 120); // 46.200 km projetados
    expect(vehicleUpdated.currentKm).toBe(45000); // Quilometragem real permanece intacta!
  });

  it('deve calcular a média diária real a partir do histórico de leituras de odômetro', () => {
    const logs: MileageLog[] = [
      { id: '1', vehicleId: 'v1', km: 40000, readingDate: '2026-10-01', source: 'manual', createdAt: '' },
      { id: '2', vehicleId: 'v1', km: 43000, readingDate: '2026-10-31', source: 'manual', createdAt: '' },
    ];
    // 3000 km em 30 dias = 100 km/dia
    expect(calculateHistoricalDailyKmAvg(logs)).toBe(100);
  });

  it('deve tratar média diária igual a zero ou ausente sem inventar datas ("Previsão indisponível")', () => {
    const vehicleZeroAvg: Vehicle = { ...baseVehicle, manualDailyKmAvg: 0 };
    const plan: MaintenancePlan = {
      id: 'p2',
      vehicleId: 'v1',
      name: 'Pastilhas de freio',
      category: 'Freios',
      components: ['Pastilhas'],
      lastMaintenanceKm: 40000,
      lastMaintenanceDate: null,
      intervalKm: 10000,
      intervalDays: null,
      intervalMonths: null,
      estimatedCostCents: null,
      customAlertKmBefore: null,
      customAlertDaysBefore: null,
      createdAt: '',
      updatedAt: '',
    };

    const proj = calculateMaintenanceProjection(plan, vehicleZeroAvg, [], '2026-11-11');
    expect(proj.nextMaintenanceKm).toBe(50000);
    expect(proj.remainingKm).toBe(5000);
    expect(proj.effectiveEstimatedDate).toBeNull();
    expect(proj.missingDataReasons.length).toBeGreaterThan(0);
  });

  it('deve considerar o critério que ocorrer primeiro (quilometragem vs tempo) e sinalizar vencida quando aplicável', () => {
    const planBoth: MaintenancePlan = {
      id: 'p3',
      vehicleId: 'v1',
      name: 'Revisão Geral',
      category: 'Revisão',
      components: [],
      lastMaintenanceKm: 42000,
      lastMaintenanceDate: '2026-05-01',
      intervalKm: 10000, // Faltam 7.000 km -> 70 dias
      intervalMonths: 6, // Venceu em 2026-11-01 (-10 dias)
      intervalDays: null,
      estimatedCostCents: 60000,
      customAlertKmBefore: 1000,
      customAlertDaysBefore: 15,
      createdAt: '',
      updatedAt: '',
    };

    const proj = calculateMaintenanceProjection(planBoth, baseVehicle, [], '2026-11-11');
    expect(proj.limitingCriterion).toBe('tempo');
    expect(proj.effectiveEstimatedDate).toBe('2026-11-01');
    expect(proj.status).toBe('vencida');
  });
});

describe('2. Geração de Parcelas Recorrentes, Pagamentos Parciais e Conflitos de Contrato', () => {
  it('deve gerar cobranças semanais exatamente no dia da semana configurado (ex: todas as terças-feiras)', () => {
    // 2026-11-01 é Domingo. Terças-feiras de Nov/2026: 03, 10, 17, 24
    const dueDates = generateContractDueDates(
      {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        isIndefinite: false,
        frequency: 'semanal',
        weeklyDay: 2, // 2 = Terça-feira
        monthlyDay: null,
        customIntervalDays: null,
        monthEndRule: 'ultimo_dia_valido',
        indefiniteWindowDays: null,
      },
      '2026-11-01'
    );

    expect(dueDates).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  });

  it('deve respeitar a regra de fim de mês para dias inexistentes (ex: dia 31 em fevereiro)', () => {
    const febDate = addMonthsWithRule('2026-01-31', 1, 31, 'ultimo_dia_valido');
    expect(febDate).toBe('2026-02-28');
  });

  it('deve tratar pagamentos parciais preservando o saldo devedor e nunca marcar vencida como paga automaticamente', () => {
    const inst = {
      expectedAmountCents: 100000, // R$ 1.000,00
      discountCents: 5000, // R$ 50,00 desconto
      surchargeCents: 0,
      paidAmountCents: 40000, // R$ 400,00 recebidos
      dueDate: '2026-11-05',
      status: 'pendente' as const,
    };

    const openBalance = getInstallmentOpenBalanceCents(inst);
    expect(openBalance).toBe(55000); // R$ 550,00 restantes
    expect(evaluateInstallmentStatus(inst, '2026-11-11')).toBe('parcialmente_paga');

    const unpaidOverdue = { ...inst, paidAmountCents: 0 };
    expect(evaluateInstallmentStatus(unpaidOverdue, '2026-11-11')).toBe('vencida');
  });

  it('deve impedir que um mesmo veículo tenha dois contratos ativos em períodos conflitantes', () => {
    const existing: Contract[] = [
      {
        id: 'c1',
        clientId: 'cli1',
        vehicleId: 'v1',
        startDate: '2026-11-01',
        endDate: '2026-11-20',
        isIndefinite: false,
        amountCents: 70000,
        frequency: 'semanal',
        weeklyDay: 2,
        monthlyDay: null,
        customIntervalDays: null,
        monthEndRule: 'ultimo_dia_valido',
        indefiniteWindowDays: null,
        deliveryKm: 10000,
        returnKm: null,
        returnDate: null,
        status: 'ativo',
        createdAt: '',
        updatedAt: '',
      },
    ];

    const conflicting = hasContractPeriodConflict(existing, {
      vehicleId: 'v1',
      startDate: '2026-11-15',
      endDate: '2026-11-30',
      isIndefinite: false,
      status: 'ativo',
    });
    expect(conflicting).not.toBeNull();

    const nonConflicting = hasContractPeriodConflict(existing, {
      vehicleId: 'v1',
      startDate: '2026-11-21',
      endDate: '2026-12-05',
      isIndefinite: false,
      status: 'ativo',
    });
    expect(nonConflicting).toBeNull();
  });
});

