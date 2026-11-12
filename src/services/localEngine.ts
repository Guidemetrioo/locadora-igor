import {
  Vehicle,
  MileageLog,
  MaintenancePlan,
  MaintenanceHistory,
  Client,
  Contract,
  Installment,
  Expense,
  SystemSettings,
  AuditLog,
  SystemNotification,
} from '../../shared/types';
import {
  calculateHistoricalDailyKmAvg,
  calculateProjectedKm,
  calculateMaintenanceProjection,
  generateContractDueDates,
  getInstallmentOpenBalanceCents,
  evaluateInstallmentStatus,
  hasContractPeriodConflict,
  daysBetween,
} from '../../shared/calculations';
import { AppStateData, EnrichedVehicle } from '../context/AppContext';

interface LocalDatabase {
  auth: {
    username: string;
    password: string;
  };
  settings: SystemSettings;
  vehicles: Vehicle[];
  mileageLogs: MileageLog[];
  maintenancePlans: MaintenancePlan[];
  maintenanceHistory: MaintenanceHistory[];
  clients: Client[];
  contracts: Contract[];
  installments: Installment[];
  expenses: Expense[];
  auditLogs: AuditLog[];
}

const STORAGE_KEY = 'fleet_rental_db_v1';

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createInitialDb(): LocalDatabase {
  return {
    auth: {
      username: 'admin',
      password: 'admin123',
    },
    settings: {
      companyName: 'Minha Locadora',
      companyDocument: '',
      companyPhone: '',
      companyEmail: '',
      companyAddress: '',
      adminName: 'Administrador',
      adminRole: 'Gestor da Frota',
      alertMaintenanceKmBefore: null,
      alertMaintenanceDaysBefore: null,
      alertPaymentDaysBefore: null,
      alertContractEndDaysBefore: null,
      defaultMonthEndRule: 'ultimo_dia_valido',
      defaultIndefiniteWindowDays: null,
      paymentMethods: ['PIX', 'Transferência Bancária', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'],
      expenseCategories: ['Manutenção', 'Seguro', 'IPVA', 'Licenciamento', 'Multas', 'Limpeza', 'Outros'],
      maintenanceCategories: [
        'Motor',
        'Filtros',
        'Freios',
        'Pneus e Rodas',
        'Suspensão e Direção',
        'Transmissão / Correias',
        'Fluidos',
        'Revisão Geral',
        'Elétrica',
        'Outros',
      ],
      commonComponents: [
        'Troca de óleo do motor',
        'Troca do filtro de óleo',
        'Troca do filtro de ar',
        'Troca do filtro de combustível',
        'Troca das pastilhas de freio',
        'Troca dos discos de freio',
        'Troca de pneus',
        'Alinhamento',
        'Balanceamento',
        'Revisão geral',
        'Troca de correia',
        'Troca de fluido de freio',
        'Palhetas do limpador',
        'Bateria',
      ],
      maintenanceTemplates: [],
    },
    vehicles: [],
    mileageLogs: [],
    maintenancePlans: [],
    maintenanceHistory: [],
    clients: [],
    contracts: [],
    installments: [],
    expenses: [],
    auditLogs: [],
  };
}

function loadLocalDb(): LocalDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const init = createInitialDb();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
      return init;
    }
    return JSON.parse(raw) as LocalDatabase;
  } catch {
    return createInitialDb();
  }
}

function saveLocalDb(db: LocalDatabase): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function buildStateFromLocalDb(db: LocalDatabase): AppStateData {
  const todayIso = getTodayIso();
  const activeVehicles = db.vehicles.filter((v) => !v.isDeleted);
  const activeClients = db.clients.filter((c) => !c.isDeleted);

  const installmentsWithEvaluatedStatus: Installment[] = db.installments.map((inst) => ({
    ...inst,
    status: evaluateInstallmentStatus(inst, todayIso),
  }));

  const vehicleEnrichments: EnrichedVehicle[] = activeVehicles.map((v) => {
    const vLogs = db.mileageLogs.filter((l) => l.vehicleId === v.id);
    const calculatedAvg = calculateHistoricalDailyKmAvg(vLogs);
    const { projectedKm, activeDailyAvg, daysSinceLastReading } = calculateProjectedKm(v, vLogs, todayIso);
    const vPlans = db.maintenancePlans.filter((p) => p.vehicleId === v.id);
    const projections = vPlans.map((plan) =>
      calculateMaintenanceProjection(plan, v, vLogs, todayIso, db.settings)
    );
    const activeContract = db.contracts.find((c) => c.vehicleId === v.id && c.status === 'ativo');
    const activeClient = activeContract
      ? activeClients.find((cl) => cl.id === activeContract.clientId) || null
      : null;

    return {
      ...v,
      calculatedDailyKmAvg: calculatedAvg,
      activeDailyKmAvg: activeDailyAvg,
      projectedCurrentKm: projectedKm,
      daysSinceLastReading,
      projections,
      activeContract: activeContract || null,
      activeClient,
    };
  });

  const allProjections = vehicleEnrichments.flatMap((v) => v.projections);
  const notifications: SystemNotification[] = [];

  for (const inst of installmentsWithEvaluatedStatus) {
    if (inst.status === 'paga' || inst.status === 'cancelada') continue;
    const openCents = getInstallmentOpenBalanceCents(inst);
    if (openCents <= 0) continue;

    const client = activeClients.find((c) => c.id === inst.clientId);
    const vehicle = activeVehicles.find((v) => v.id === inst.vehicleId);
    const diffDays = daysBetween(todayIso, inst.dueDate);

    if (diffDays < 0) {
      notifications.push({
        id: `notif-inst-overdue-${inst.id}`,
        type: 'pagamento_vencido',
        severity: 'danger',
        title: `Parcela #${inst.installmentNumber} Vencida`,
        message: `${client?.fullName || 'Cliente'} (${vehicle?.plate || 'Veículo'}) — Venceu em ${inst.dueDate.split('-').reverse().join('/')}`,
        entityId: inst.id,
        vehicleId: inst.vehicleId,
        clientId: inst.clientId,
        dueDate: inst.dueDate,
      });
    } else if (
      diffDays === 0 ||
      (db.settings.alertPaymentDaysBefore !== null &&
        db.settings.alertPaymentDaysBefore >= 0 &&
        diffDays <= db.settings.alertPaymentDaysBefore)
    ) {
      notifications.push({
        id: `notif-inst-soon-${inst.id}`,
        type: 'pagamento_proximo',
        severity: 'warning',
        title: diffDays === 0 ? `Parcela #${inst.installmentNumber} Vence Hoje` : `Pagamento em ${diffDays} dia(s)`,
        message: `${client?.fullName || 'Cliente'} (${vehicle?.plate || 'Veículo'}) — Vencimento ${inst.dueDate.split('-').reverse().join('/')}`,
        entityId: inst.id,
        vehicleId: inst.vehicleId,
        clientId: inst.clientId,
        dueDate: inst.dueDate,
      });
    }
  }

  for (const proj of allProjections) {
    const plan = db.maintenancePlans.find((p) => p.id === proj.planId);
    const vehicle = activeVehicles.find((v) => v.id === proj.vehicleId);
    if (!plan || !vehicle) continue;

    if (proj.status === 'vencida') {
      notifications.push({
        id: `notif-maint-overdue-${plan.id}`,
        type: 'manutencao_vencida',
        severity: 'danger',
        title: `Manutenção Vencida: ${plan.name}`,
        message: `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
        entityId: plan.id,
        vehicleId: vehicle.id,
        dueDate: proj.effectiveEstimatedDate || undefined,
      });
    } else if (proj.status === 'proxima') {
      notifications.push({
        id: `notif-maint-soon-${plan.id}`,
        type: 'manutencao_proxima',
        severity: 'warning',
        title: `Manutenção Próxima: ${plan.name}`,
        message: `${vehicle.brand} ${vehicle.model} (${vehicle.plate}) — Restam ${proj.remainingKm !== null ? `${proj.remainingKm} km` : ''}`,
        entityId: plan.id,
        vehicleId: vehicle.id,
        dueDate: proj.effectiveEstimatedDate || undefined,
      });
    }
  }

  return {
    todayIso,
    settings: db.settings,
    vehicles: vehicleEnrichments,
    mileageLogs: db.mileageLogs,
    maintenancePlans: db.maintenancePlans,
    maintenanceProjections: allProjections,
    maintenanceHistory: db.maintenanceHistory,
    clients: activeClients,
    contracts: db.contracts,
    installments: installmentsWithEvaluatedStatus,
    expenses: db.expenses,
    notifications,
    auditLogs: db.auditLogs.slice(0, 100),
  };
}

export async function handleLocalApiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : {};
  const db = loadLocalDb();
  const nowIso = new Date().toISOString();
  const todayIso = getTodayIso();

  if (path === '/api/auth/login' && method === 'POST') {
    if (
      String(body.username || '').toLowerCase() === db.auth.username.toLowerCase() &&
      body.password === db.auth.password
    ) {
      return {
        token: 'local_token_admin',
        username: db.auth.username,
        adminName: db.settings.adminName,
        companyName: db.settings.companyName,
      } as unknown as T;
    }
    throw new Error('Usuário ou senha inválidos.');
  }

  if (path.startsWith('/api/state') && method === 'GET') {
    return buildStateFromLocalDb(db) as unknown as T;
  }

  // Vehicles
  if (path === '/api/vehicles' && method === 'POST') {
    const plate = String(body.plate || '').trim().toUpperCase();
    if (!body.brand || !body.model || !plate) throw new Error('Marca, Modelo e Placa são obrigatórios.');
    if (db.vehicles.some((v) => !v.isDeleted && v.plate.toUpperCase() === plate)) {
      throw new Error('Já existe um veículo ativo cadastrado com esta placa.');
    }
    const currentKm = Number(body.currentKm) || 0;
    const lastKmUpdateDate = body.lastKmUpdateDate || todayIso;
    const newVehicle: Vehicle = {
      id: uid(),
      brand: String(body.brand).trim(),
      model: String(body.model).trim(),
      manufacturingYear: Number(body.manufacturingYear) || new Date().getFullYear(),
      modelYear: Number(body.modelYear) || new Date().getFullYear(),
      plate,
      color: String(body.color || '').trim(),
      renavam: body.renavam || undefined,
      chassis: body.chassis || undefined,
      photoUrl: body.photoUrl || undefined,
      acquisitionDate: body.acquisitionDate || undefined,
      acquisitionValueCents: body.acquisitionValueCents ? Math.round(Number(body.acquisitionValueCents)) : undefined,
      status: body.status || 'disponivel',
      currentKm,
      lastKmUpdateDate,
      manualDailyKmAvg:
        body.manualDailyKmAvg !== undefined && body.manualDailyKmAvg !== null && body.manualDailyKmAvg !== ''
          ? Number(body.manualDailyKmAvg)
          : null,
      avgCalculationMode: body.avgCalculationMode === 'calculated' ? 'calculated' : 'manual',
      notes: body.notes || undefined,
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.vehicles.push(newVehicle);
    db.mileageLogs.push({
      id: uid(),
      vehicleId: newVehicle.id,
      km: currentKm,
      readingDate: lastKmUpdateDate,
      source: 'cadastro_inicial',
      notes: 'Leitura inicial no cadastro',
      createdAt: nowIso,
    });
    saveLocalDb(db);
    return newVehicle as unknown as T;
  }

  const vehicleMileageMatch = path.match(/^\/api\/vehicles\/([^/]+)\/mileage$/);
  if (vehicleMileageMatch && method === 'POST') {
    const v = db.vehicles.find((veh) => veh.id === vehicleMileageMatch[1] && !veh.isDeleted);
    if (!v) throw new Error('Veículo não encontrado.');
    const parsedKm = Number(body.km);
    const dateToUse = body.readingDate || todayIso;
    db.mileageLogs.push({
      id: uid(),
      vehicleId: v.id,
      km: parsedKm,
      readingDate: dateToUse,
      source: 'manual',
      notes: body.notes || 'Leitura registrada',
      createdAt: nowIso,
    });
    v.currentKm = parsedKm;
    v.lastKmUpdateDate = dateToUse;
    if (body.manualDailyKmAvg !== undefined) {
      v.manualDailyKmAvg = body.manualDailyKmAvg === null || body.manualDailyKmAvg === '' ? null : Number(body.manualDailyKmAvg);
    }
    if (body.avgCalculationMode) v.avgCalculationMode = body.avgCalculationMode;
    v.updatedAt = nowIso;
    saveLocalDb(db);
    return v as unknown as T;
  }

  const vehicleIdMatch = path.match(/^\/api\/vehicles\/([^/]+)$/);
  if (vehicleIdMatch) {
    const v = db.vehicles.find((veh) => veh.id === vehicleIdMatch[1] && !veh.isDeleted);
    if (!v) throw new Error('Veículo não encontrado.');
    if (method === 'PUT') {
      Object.assign(v, {
        ...body,
        plate: body.plate ? String(body.plate).toUpperCase() : v.plate,
        updatedAt: nowIso,
      });
      saveLocalDb(db);
      return v as unknown as T;
    }
    if (method === 'DELETE') {
      v.isDeleted = true;
      saveLocalDb(db);
      return { ok: true } as unknown as T;
    }
  }

  // Maintenance Plans
  if (path === '/api/maintenance-plans' && method === 'POST') {
    const newPlan: MaintenancePlan = {
      id: uid(),
      vehicleId: body.vehicleId,
      name: String(body.name).trim(),
      category: String(body.category || 'Manutenção').trim(),
      components: Array.isArray(body.components) ? body.components : [],
      lastMaintenanceKm: body.lastMaintenanceKm !== null && body.lastMaintenanceKm !== '' ? Number(body.lastMaintenanceKm) : null,
      lastMaintenanceDate: body.lastMaintenanceDate || null,
      intervalKm: body.intervalKm !== null && body.intervalKm !== '' ? Number(body.intervalKm) : null,
      intervalDays: body.intervalDays !== null && body.intervalDays !== '' ? Number(body.intervalDays) : null,
      intervalMonths: body.intervalMonths !== null && body.intervalMonths !== '' ? Number(body.intervalMonths) : null,
      estimatedCostCents: body.estimatedCostCents !== null && body.estimatedCostCents !== '' ? Math.round(Number(body.estimatedCostCents)) : null,
      customAlertKmBefore: body.customAlertKmBefore !== null && body.customAlertKmBefore !== '' ? Number(body.customAlertKmBefore) : null,
      customAlertDaysBefore: body.customAlertDaysBefore !== null && body.customAlertDaysBefore !== '' ? Number(body.customAlertDaysBefore) : null,
      notes: body.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.maintenancePlans.push(newPlan);
    saveLocalDb(db);
    return newPlan as unknown as T;
  }

  const planIdMatch = path.match(/^\/api\/maintenance-plans\/([^/]+)$/);
  if (planIdMatch) {
    const idx = db.maintenancePlans.findIndex((p) => p.id === planIdMatch[1]);
    if (idx === -1) throw new Error('Plano não encontrado.');
    if (method === 'PUT') {
      db.maintenancePlans[idx] = { ...db.maintenancePlans[idx], ...body, updatedAt: nowIso };
      saveLocalDb(db);
      return db.maintenancePlans[idx] as unknown as T;
    }
    if (method === 'DELETE') {
      db.maintenancePlans.splice(idx, 1);
      saveLocalDb(db);
      return { ok: true } as unknown as T;
    }
  }

  // Maintenance History
  if (path === '/api/maintenance-history' && method === 'POST') {
    const v = db.vehicles.find((veh) => veh.id === body.vehicleId && !veh.isDeleted);
    if (!v) throw new Error('Veículo não encontrado.');
    const executionKm = Number(body.executionKm);
    const costCents = Math.round(Number(body.costCents || 0));
    const historyId = uid();
    const expenseId = costCents > 0 ? uid() : undefined;

    const entry: MaintenanceHistory = {
      id: historyId,
      planId: body.planId || null,
      vehicleId: v.id,
      serviceName: body.serviceName,
      category: body.category || 'Manutenção',
      components: Array.isArray(body.components) ? body.components : [],
      executionDate: body.executionDate,
      executionKm,
      costCents,
      provider: body.provider,
      notes: body.notes,
      attachmentName: body.attachmentName,
      attachmentData: body.attachmentData,
      expenseId,
      createdAt: nowIso,
    };
    db.maintenanceHistory.unshift(entry);

    if (body.planId) {
      const plan = db.maintenancePlans.find((p) => p.id === body.planId);
      if (plan) {
        plan.lastMaintenanceKm = executionKm;
        plan.lastMaintenanceDate = body.executionDate;
      }
    }
    db.mileageLogs.push({
      id: uid(),
      vehicleId: v.id,
      km: executionKm,
      readingDate: body.executionDate,
      source: 'manutencao',
      notes: `Manutenção: ${entry.serviceName}`,
      createdAt: nowIso,
    });
    if (executionKm >= v.currentKm) {
      v.currentKm = executionKm;
      v.lastKmUpdateDate = body.executionDate;
    }
    if (expenseId && costCents > 0) {
      db.expenses.unshift({
        id: expenseId,
        vehicleId: v.id,
        category: 'Manutenção',
        description: entry.serviceName,
        amountCents: costCents,
        date: body.executionDate,
        status: 'paga',
        maintenanceHistoryId: historyId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    saveLocalDb(db);
    return entry as unknown as T;
  }

  // Clients
  if (path === '/api/clients' && method === 'POST') {
    const newClient: Client = {
      id: uid(),
      fullName: body.fullName,
      document: body.document,
      phone: body.phone || '',
      whatsapp: body.whatsapp || body.phone || '',
      email: body.email || '',
      address: body.address || '',
      cnhNumber: body.cnhNumber,
      cnhExpiry: body.cnhExpiry,
      notes: body.notes,
      attachments: body.attachments || [],
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.clients.push(newClient);
    saveLocalDb(db);
    return newClient as unknown as T;
  }

  const clientIdMatch = path.match(/^\/api\/clients\/([^/]+)$/);
  if (clientIdMatch) {
    const cli = db.clients.find((c) => c.id === clientIdMatch[1] && !c.isDeleted);
    if (!cli) throw new Error('Cliente não encontrado.');
    if (method === 'PUT') {
      Object.assign(cli, { ...body, updatedAt: nowIso });
      saveLocalDb(db);
      return cli as unknown as T;
    }
    if (method === 'DELETE') {
      cli.isDeleted = true;
      saveLocalDb(db);
      return { ok: true } as unknown as T;
    }
  }

  // Contracts
  if (path === '/api/contracts' && method === 'POST') {
    const conflict = hasContractPeriodConflict(db.contracts, {
      vehicleId: body.vehicleId,
      startDate: body.startDate,
      endDate: body.isIndefinite ? null : body.endDate,
      isIndefinite: Boolean(body.isIndefinite),
      status: 'ativo',
    });
    if (conflict) {
      throw new Error('Este veículo já possui um contrato ativo em período conflitante.');
    }

    const v = db.vehicles.find((veh) => veh.id === body.vehicleId);
    const newContract: Contract = {
      id: uid(),
      clientId: body.clientId,
      vehicleId: body.vehicleId,
      startDate: body.startDate,
      endDate: body.isIndefinite ? null : body.endDate,
      isIndefinite: Boolean(body.isIndefinite),
      amountCents: Math.round(Number(body.amountCents)),
      frequency: body.frequency || 'semanal',
      weeklyDay: body.weeklyDay !== null ? Number(body.weeklyDay) : null,
      monthlyDay: body.monthlyDay !== null ? Number(body.monthlyDay) : null,
      customIntervalDays: body.customIntervalDays ? Number(body.customIntervalDays) : null,
      monthEndRule: body.monthEndRule || 'ultimo_dia_valido',
      indefiniteWindowDays: body.indefiniteWindowDays ? Number(body.indefiniteWindowDays) : null,
      deliveryKm: Number(body.deliveryKm || 0),
      returnKm: null,
      returnDate: null,
      paymentMethod: body.paymentMethod || 'PIX',
      status: 'ativo',
      notes: body.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.contracts.unshift(newContract);
    if (v) v.status = 'alugado';

    const dueDates = generateContractDueDates(newContract, todayIso);
    dueDates.forEach((dueDate, idx) => {
      db.installments.push({
        id: uid(),
        contractId: newContract.id,
        clientId: newContract.clientId,
        vehicleId: newContract.vehicleId,
        installmentNumber: idx + 1,
        dueDate,
        expectedAmountCents: newContract.amountCents,
        discountCents: 0,
        surchargeCents: 0,
        paidAmountCents: 0,
        lastPaymentDate: null,
        paymentMethod: newContract.paymentMethod || 'PIX',
        status: dueDate < todayIso ? 'vencida' : 'pendente',
        payments: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });
    saveLocalDb(db);
    return { contract: newContract, generatedInstallmentsCount: dueDates.length } as unknown as T;
  }

  const contractCloseMatch = path.match(/^\/api\/contracts\/([^/]+)\/close$/);
  if (contractCloseMatch && method === 'POST') {
    const c = db.contracts.find((ct) => ct.id === contractCloseMatch[1]);
    if (!c) throw new Error('Contrato não encontrado.');
    const parsedReturnKm = Number(body.returnKm);
    const closeDateIso = body.returnDate || todayIso;
    c.returnKm = parsedReturnKm;
    c.returnDate = closeDateIso;
    c.status = 'encerrado';
    const v = db.vehicles.find((veh) => veh.id === c.vehicleId);
    if (v) {
      v.status = 'disponivel';
      v.currentKm = parsedReturnKm;
      v.lastKmUpdateDate = closeDateIso;
      if (body.updateVehicleDailyAvg) {
        const rentalDays = Math.max(1, daysBetween(c.startDate, closeDateIso));
        const diffKm = parsedReturnKm - c.deliveryKm;
        if (diffKm >= 0) v.manualDailyKmAvg = Math.round((diffKm / rentalDays) * 100) / 100;
      }
    }
    if (body.cancelFuturePendingInstallments) {
      for (const inst of db.installments) {
        if (inst.contractId === c.id && inst.dueDate > closeDateIso && inst.paidAmountCents === 0) {
          inst.status = 'cancelada';
        }
      }
    }
    saveLocalDb(db);
    return c as unknown as T;
  }

  // Installments
  if (path === '/api/installments' && method === 'POST') {
    const newInst: Installment = {
      id: uid(),
      contractId: body.contractId || null,
      clientId: body.clientId,
      vehicleId: body.vehicleId,
      installmentNumber: db.installments.filter((i) => i.clientId === body.clientId).length + 1,
      dueDate: body.dueDate,
      expectedAmountCents: Math.round(Number(body.expectedAmountCents)),
      discountCents: 0,
      surchargeCents: 0,
      paidAmountCents: 0,
      lastPaymentDate: null,
      paymentMethod: body.paymentMethod || 'PIX',
      status: body.dueDate < todayIso ? 'vencida' : 'pendente',
      payments: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.installments.push(newInst);
    saveLocalDb(db);
    return newInst as unknown as T;
  }

  const instPayMatch = path.match(/^\/api\/installments\/([^/]+)\/pay$/);
  if (instPayMatch && method === 'POST') {
    const inst = db.installments.find((i) => i.id === instPayMatch[1]);
    if (!inst) throw new Error('Parcela não encontrada.');
    const amountCents = Math.round(Number(body.amountCents));
    if (body.discountCents !== undefined) inst.discountCents = Math.round(Number(body.discountCents));
    if (body.surchargeCents !== undefined) inst.surchargeCents = Math.round(Number(body.surchargeCents));
    inst.payments.push({
      id: uid(),
      installmentId: inst.id,
      amountCents,
      paymentDate: body.paymentDate || todayIso,
      paymentMethod: body.paymentMethod || 'PIX',
      createdAt: nowIso,
    });
    inst.paidAmountCents = inst.payments.reduce((s, p) => s + p.amountCents, 0);
    inst.lastPaymentDate = body.paymentDate || todayIso;
    inst.status = evaluateInstallmentStatus(inst, todayIso);
    saveLocalDb(db);
    return inst as unknown as T;
  }

  const instIdMatch = path.match(/^\/api\/installments\/([^/]+)$/);
  if (instIdMatch && method === 'PUT') {
    const inst = db.installments.find((i) => i.id === instIdMatch[1]);
    if (!inst) throw new Error('Parcela não encontrada.');
    Object.assign(inst, body);
    if (body.status !== 'cancelada') {
      inst.status = evaluateInstallmentStatus({ ...inst, status: 'pendente' }, todayIso);
    }
    saveLocalDb(db);
    return inst as unknown as T;
  }

  // Expenses
  if (path === '/api/expenses' && method === 'POST') {
    const exp: Expense = {
      id: uid(),
      vehicleId: body.vehicleId,
      category: body.category,
      description: body.description,
      amountCents: Math.round(Number(body.amountCents)),
      date: body.date || todayIso,
      status: body.status || 'paga',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.expenses.unshift(exp);
    saveLocalDb(db);
    return exp as unknown as T;
  }

  const expIdMatch = path.match(/^\/api\/expenses\/([^/]+)$/);
  if (expIdMatch && method === 'DELETE') {
    const idx = db.expenses.findIndex((e) => e.id === expIdMatch[1]);
    if (idx !== -1) db.expenses.splice(idx, 1);
    saveLocalDb(db);
    return { ok: true } as unknown as T;
  }

  // Settings
  if (path === '/api/settings' && method === 'PUT') {
    db.settings = {
      ...db.settings,
      ...body,
      alertMaintenanceKmBefore: body.alertMaintenanceKmBefore === '' || body.alertMaintenanceKmBefore === null ? null : Number(body.alertMaintenanceKmBefore),
      alertMaintenanceDaysBefore: body.alertMaintenanceDaysBefore === '' || body.alertMaintenanceDaysBefore === null ? null : Number(body.alertMaintenanceDaysBefore),
      alertPaymentDaysBefore: body.alertPaymentDaysBefore === '' || body.alertPaymentDaysBefore === null ? null : Number(body.alertPaymentDaysBefore),
      alertContractEndDaysBefore: body.alertContractEndDaysBefore === '' || body.alertContractEndDaysBefore === null ? null : Number(body.alertContractEndDaysBefore),
      defaultIndefiniteWindowDays: body.defaultIndefiniteWindowDays === '' || body.defaultIndefiniteWindowDays === null ? null : Number(body.defaultIndefiniteWindowDays),
    };
    saveLocalDb(db);
    return db.settings as unknown as T;
  }

  throw new Error('Rota não encontrada.');
}

