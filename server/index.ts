import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { getDb, saveDb, hashPassword, addAuditLog } from './db';
import {
  calculateHistoricalDailyKmAvg,
  calculateProjectedKm,
  calculateMaintenanceProjection,
  generateContractDueDates,
  getInstallmentNetTotalCents,
  getInstallmentOpenBalanceCents,
  evaluateInstallmentStatus,
  hasContractPeriodConflict,
  formatISODate,
  daysBetween,
} from '../shared/calculations';
import {
  Vehicle,
  MaintenancePlan,
  MaintenanceHistory,
  Client,
  Contract,
  Installment,
  Expense,
  SystemNotification,
} from '../shared/types';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autorizado. Faça login.' });
    return;
  }
  const token = authHeader.slice(7);
  const db = getDb();
  if (!db.auth.tokens.includes(token)) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return;
  }
  next();
}

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const db = getDb();
  const hash = hashPassword(password || '');
  if (
    String(username || '').toLowerCase() === db.auth.username.toLowerCase() &&
    hash === db.auth.passwordHash
  ) {
    const token = crypto.randomUUID();
    db.auth.tokens.push(token);
    if (db.auth.tokens.length > 20) db.auth.tokens.shift();
    saveDb(db);
    res.json({
      token,
      username: db.auth.username,
      adminName: db.settings.adminName,
      companyName: db.settings.companyName,
    });
    return;
  }
  res.status(401).json({ error: 'Usuário ou senha inválidos.' });
});

app.post('/api/auth/change-password', requireAuth, (req: Request, res: Response) => {
  const { currentPassword, newPassword, newUsername } = req.body;
  const db = getDb();
  if (hashPassword(currentPassword || '') !== db.auth.passwordHash) {
    res.status(400).json({ error: 'Senha atual incorreta.' });
    return;
  }
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
    return;
  }
  db.auth.passwordHash = hashPassword(newPassword);
  if (newUsername && newUsername.trim()) {
    db.auth.username = newUsername.trim();
  }
  addAuditLog(db, 'configuracao', 'auth', 'edicao', 'Credenciais de administrador atualizadas');
  saveDb(db);
  res.json({ ok: true, username: db.auth.username });
});

// --- STATE & DASHBOARD BUNDLE ---
app.get('/api/state', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const todayIso = (req.query.referenceDate as string) || getTodayIso();

  const activeVehicles = db.vehicles.filter((v) => !v.isDeleted);
  const activeClients = db.clients.filter((c) => !c.isDeleted);

  // Refresh installment dynamic status against todayIso (without saving unless needed)
  const installmentsWithEvaluatedStatus: Installment[] = db.installments.map((inst) => ({
    ...inst,
    status: evaluateInstallmentStatus(inst, todayIso),
  }));

  // Compute projections for each vehicle and maintenance plan
  const vehicleEnrichments = activeVehicles.map((v) => {
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

  // Build in-app notifications based on configured alert rules
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
        message: `${vehicle.brand} ${vehicle.model} (${vehicle.plate}) — Restam ${proj.remainingKm !== null ? `${proj.remainingKm} km` : ''} ${proj.effectiveRemainingDays !== null ? `(~${proj.effectiveRemainingDays} dias)` : ''}`,
        entityId: plan.id,
        vehicleId: vehicle.id,
        dueDate: proj.effectiveEstimatedDate || undefined,
      });
    }
  }

  for (const contract of db.contracts) {
    if (contract.status !== 'ativo' || contract.isIndefinite || !contract.endDate) continue;
    const diffDays = daysBetween(todayIso, contract.endDate);
    if (
      diffDays <= 0 ||
      (db.settings.alertContractEndDaysBefore !== null &&
        db.settings.alertContractEndDaysBefore >= 0 &&
        diffDays <= db.settings.alertContractEndDaysBefore)
    ) {
      const client = activeClients.find((c) => c.id === contract.clientId);
      const vehicle = activeVehicles.find((v) => v.id === contract.vehicleId);
      notifications.push({
        id: `notif-contract-end-${contract.id}`,
        type: 'contrato_encerrando',
        severity: diffDays < 0 ? 'danger' : 'info',
        title: diffDays < 0 ? 'Contrato com Prazo Expirado' : `Contrato encerra em ${diffDays} dia(s)`,
        message: `${client?.fullName || 'Cliente'} — ${vehicle?.plate || 'Veículo'} (${contract.endDate.split('-').reverse().join('/')})`,
        entityId: contract.id,
        vehicleId: contract.vehicleId,
        clientId: contract.clientId,
        dueDate: contract.endDate,
      });
    }
  }

  res.json({
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
  });
});

// --- VEHICLES CRUD & MILEAGE ---
app.post('/api/vehicles', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;
  const plate = String(body.plate || '').trim().toUpperCase();

  if (!body.brand || !body.model || !plate) {
    res.status(400).json({ error: 'Marca, Modelo e Placa são obrigatórios.' });
    return;
  }

  if (db.vehicles.some((v) => !v.isDeleted && v.plate.toUpperCase() === plate)) {
    res.status(400).json({ error: 'Já existe um veículo ativo cadastrado com esta placa.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const todayIso = getTodayIso();
  const currentKm = Number(body.currentKm) || 0;
  const lastKmUpdateDate = body.lastKmUpdateDate || todayIso;

  const newVehicle: Vehicle = {
    id: crypto.randomUUID(),
    brand: String(body.brand).trim(),
    model: String(body.model).trim(),
    manufacturingYear: Number(body.manufacturingYear) || new Date().getFullYear(),
    modelYear: Number(body.modelYear) || new Date().getFullYear(),
    plate,
    color: String(body.color || '').trim(),
    renavam: body.renavam ? String(body.renavam).trim() : undefined,
    chassis: body.chassis ? String(body.chassis).trim() : undefined,
    photoUrl: body.photoUrl || undefined,
    acquisitionDate: body.acquisitionDate || undefined,
    acquisitionValueCents:
      body.acquisitionValueCents !== undefined && body.acquisitionValueCents !== null && body.acquisitionValueCents !== ''
        ? Math.round(Number(body.acquisitionValueCents))
        : undefined,
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

  // Record initial odometer reading in history
  db.mileageLogs.push({
    id: crypto.randomUUID(),
    vehicleId: newVehicle.id,
    km: currentKm,
    readingDate: lastKmUpdateDate,
    source: 'cadastro_inicial',
    notes: 'Leitura inicial no cadastro do veículo',
    createdAt: nowIso,
  });

  addAuditLog(db, 'veiculo', newVehicle.id, 'criacao', `Veículo ${newVehicle.brand} ${newVehicle.model} (${newVehicle.plate}) cadastrado com ${currentKm} km`);
  saveDb(db);
  res.status(201).json(newVehicle);
});

app.put('/api/vehicles/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const vehicle = db.vehicles.find((v) => v.id === req.params.id && !v.isDeleted);
  if (!vehicle) {
    res.status(404).json({ error: 'Veículo não encontrado.' });
    return;
  }

  const body = req.body;
  const newPlate = body.plate ? String(body.plate).trim().toUpperCase() : vehicle.plate;
  if (
    newPlate !== vehicle.plate &&
    db.vehicles.some((v) => !v.isDeleted && v.id !== vehicle.id && v.plate.toUpperCase() === newPlate)
  ) {
    res.status(400).json({ error: 'Outra viatura já utiliza esta placa.' });
    return;
  }

  const prevKm = vehicle.currentKm;
  vehicle.brand = body.brand !== undefined ? String(body.brand).trim() : vehicle.brand;
  vehicle.model = body.model !== undefined ? String(body.model).trim() : vehicle.model;
  vehicle.manufacturingYear = body.manufacturingYear !== undefined ? Number(body.manufacturingYear) : vehicle.manufacturingYear;
  vehicle.modelYear = body.modelYear !== undefined ? Number(body.modelYear) : vehicle.modelYear;
  vehicle.plate = newPlate;
  vehicle.color = body.color !== undefined ? String(body.color).trim() : vehicle.color;
  vehicle.renavam = body.renavam !== undefined ? String(body.renavam).trim() : vehicle.renavam;
  vehicle.chassis = body.chassis !== undefined ? String(body.chassis).trim() : vehicle.chassis;
  vehicle.photoUrl = body.photoUrl !== undefined ? body.photoUrl : vehicle.photoUrl;
  vehicle.acquisitionDate = body.acquisitionDate !== undefined ? body.acquisitionDate : vehicle.acquisitionDate;
  vehicle.acquisitionValueCents =
    body.acquisitionValueCents !== undefined
      ? body.acquisitionValueCents === null || body.acquisitionValueCents === ''
        ? undefined
        : Math.round(Number(body.acquisitionValueCents))
      : vehicle.acquisitionValueCents;
  vehicle.status = body.status || vehicle.status;
  vehicle.manualDailyKmAvg =
    body.manualDailyKmAvg !== undefined
      ? body.manualDailyKmAvg === null || body.manualDailyKmAvg === ''
        ? null
        : Number(body.manualDailyKmAvg)
      : vehicle.manualDailyKmAvg;
  vehicle.avgCalculationMode = body.avgCalculationMode || vehicle.avgCalculationMode;
  vehicle.notes = body.notes !== undefined ? body.notes : vehicle.notes;

  if (body.currentKm !== undefined && Number(body.currentKm) !== prevKm) {
    const newKm = Number(body.currentKm);
    const readingDate = body.lastKmUpdateDate || getTodayIso();
    vehicle.currentKm = newKm;
    vehicle.lastKmUpdateDate = readingDate;
    db.mileageLogs.push({
      id: crypto.randomUUID(),
      vehicleId: vehicle.id,
      km: newKm,
      readingDate,
      source: 'manual',
      notes: 'Atualização na edição do veículo',
      createdAt: new Date().toISOString(),
    });
  } else if (body.lastKmUpdateDate) {
    vehicle.lastKmUpdateDate = body.lastKmUpdateDate;
  }

  vehicle.updatedAt = new Date().toISOString();
  addAuditLog(db, 'veiculo', vehicle.id, 'edicao', `Dados do veículo ${vehicle.plate} atualizados`);
  saveDb(db);
  res.json(vehicle);
});

app.post('/api/vehicles/:id/mileage', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const vehicle = db.vehicles.find((v) => v.id === req.params.id && !v.isDeleted);
  if (!vehicle) {
    res.status(404).json({ error: 'Veículo não encontrado.' });
    return;
  }

  const { km, readingDate, notes, manualDailyKmAvg, avgCalculationMode } = req.body;
  const parsedKm = Number(km);
  if (Number.isNaN(parsedKm) || parsedKm < 0) {
    res.status(400).json({ error: 'Informe uma quilometragem válida.' });
    return;
  }

  const dateToUse = readingDate || getTodayIso();
  const nowIso = new Date().toISOString();

  db.mileageLogs.push({
    id: crypto.randomUUID(),
    vehicleId: vehicle.id,
    km: parsedKm,
    readingDate: dateToUse,
    source: 'manual',
    notes: notes || 'Leitura de odômetro registrada',
    createdAt: nowIso,
  });

  // Update real vehicle km if this reading is on or after the last reading date
  if (dateToUse >= vehicle.lastKmUpdateDate || parsedKm >= vehicle.currentKm) {
    vehicle.currentKm = parsedKm;
    vehicle.lastKmUpdateDate = dateToUse;
  }

  if (manualDailyKmAvg !== undefined) {
    vehicle.manualDailyKmAvg = manualDailyKmAvg === '' || manualDailyKmAvg === null ? null : Number(manualDailyKmAvg);
  }
  if (avgCalculationMode) {
    vehicle.avgCalculationMode = avgCalculationMode;
  }
  vehicle.updatedAt = nowIso;

  addAuditLog(db, 'veiculo', vehicle.id, 'edicao', `Odômetro de ${vehicle.plate} atualizado para ${parsedKm} km em ${dateToUse}`);
  saveDb(db);
  res.json(vehicle);
});

app.delete('/api/vehicles/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const vehicle = db.vehicles.find((v) => v.id === req.params.id && !v.isDeleted);
  if (!vehicle) {
    res.status(404).json({ error: 'Veículo não encontrado.' });
    return;
  }
  vehicle.isDeleted = true;
  vehicle.updatedAt = new Date().toISOString();
  addAuditLog(db, 'veiculo', vehicle.id, 'exclusao', `Veículo ${vehicle.plate} removido logicamente`);
  saveDb(db);
  res.json({ ok: true });
});

// --- MAINTENANCE PLANS & EXECUTION ---
app.post('/api/maintenance-plans', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;
  if (!body.vehicleId || !body.name) {
    res.status(400).json({ error: 'Selecione o veículo e informe o nome da manutenção.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const newPlan: MaintenancePlan = {
    id: crypto.randomUUID(),
    vehicleId: body.vehicleId,
    name: String(body.name).trim(),
    category: String(body.category || 'Manutenção').trim(),
    components: Array.isArray(body.components) ? body.components : [],
    lastMaintenanceKm:
      body.lastMaintenanceKm !== undefined && body.lastMaintenanceKm !== null && body.lastMaintenanceKm !== ''
        ? Number(body.lastMaintenanceKm)
        : null,
    lastMaintenanceDate: body.lastMaintenanceDate || null,
    intervalKm:
      body.intervalKm !== undefined && body.intervalKm !== null && body.intervalKm !== ''
        ? Number(body.intervalKm)
        : null,
    intervalDays:
      body.intervalDays !== undefined && body.intervalDays !== null && body.intervalDays !== ''
        ? Number(body.intervalDays)
        : null,
    intervalMonths:
      body.intervalMonths !== undefined && body.intervalMonths !== null && body.intervalMonths !== ''
        ? Number(body.intervalMonths)
        : null,
    estimatedCostCents:
      body.estimatedCostCents !== undefined && body.estimatedCostCents !== null && body.estimatedCostCents !== ''
        ? Math.round(Number(body.estimatedCostCents))
        : null,
    customAlertKmBefore:
      body.customAlertKmBefore !== undefined && body.customAlertKmBefore !== null && body.customAlertKmBefore !== ''
        ? Number(body.customAlertKmBefore)
        : null,
    customAlertDaysBefore:
      body.customAlertDaysBefore !== undefined && body.customAlertDaysBefore !== null && body.customAlertDaysBefore !== ''
        ? Number(body.customAlertDaysBefore)
        : null,
    notes: body.notes || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.maintenancePlans.push(newPlan);
  addAuditLog(db, 'manutencao', newPlan.id, 'criacao', `Plano de manutenção "${newPlan.name}" configurado`);
  saveDb(db);
  res.status(201).json(newPlan);
});

app.put('/api/maintenance-plans/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const plan = db.maintenancePlans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Plano de manutenção não encontrado.' });
    return;
  }

  const body = req.body;
  plan.name = body.name !== undefined ? String(body.name).trim() : plan.name;
  plan.category = body.category !== undefined ? String(body.category).trim() : plan.category;
  plan.components = Array.isArray(body.components) ? body.components : plan.components;
  plan.lastMaintenanceKm =
    body.lastMaintenanceKm !== undefined
      ? body.lastMaintenanceKm === '' || body.lastMaintenanceKm === null
        ? null
        : Number(body.lastMaintenanceKm)
      : plan.lastMaintenanceKm;
  plan.lastMaintenanceDate =
    body.lastMaintenanceDate !== undefined ? body.lastMaintenanceDate || null : plan.lastMaintenanceDate;
  plan.intervalKm =
    body.intervalKm !== undefined
      ? body.intervalKm === '' || body.intervalKm === null
        ? null
        : Number(body.intervalKm)
      : plan.intervalKm;
  plan.intervalDays =
    body.intervalDays !== undefined
      ? body.intervalDays === '' || body.intervalDays === null
        ? null
        : Number(body.intervalDays)
      : plan.intervalDays;
  plan.intervalMonths =
    body.intervalMonths !== undefined
      ? body.intervalMonths === '' || body.intervalMonths === null
        ? null
        : Number(body.intervalMonths)
      : plan.intervalMonths;
  plan.estimatedCostCents =
    body.estimatedCostCents !== undefined
      ? body.estimatedCostCents === '' || body.estimatedCostCents === null
        ? null
        : Math.round(Number(body.estimatedCostCents))
      : plan.estimatedCostCents;
  plan.customAlertKmBefore =
    body.customAlertKmBefore !== undefined
      ? body.customAlertKmBefore === '' || body.customAlertKmBefore === null
        ? null
        : Number(body.customAlertKmBefore)
      : plan.customAlertKmBefore;
  plan.customAlertDaysBefore =
    body.customAlertDaysBefore !== undefined
      ? body.customAlertDaysBefore === '' || body.customAlertDaysBefore === null
        ? null
        : Number(body.customAlertDaysBefore)
      : plan.customAlertDaysBefore;
  plan.notes = body.notes !== undefined ? body.notes : plan.notes;
  plan.updatedAt = new Date().toISOString();

  addAuditLog(db, 'manutencao', plan.id, 'edicao', `Plano de manutenção "${plan.name}" atualizado`);
  saveDb(db);
  res.json(plan);
});

app.delete('/api/maintenance-plans/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const idx = db.maintenancePlans.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Plano de manutenção não encontrado.' });
    return;
  }
  const removed = db.maintenancePlans.splice(idx, 1)[0];
  addAuditLog(db, 'manutencao', removed.id, 'exclusao', `Plano de manutenção "${removed.name}" excluído`);
  saveDb(db);
  res.json({ ok: true });
});

// Register executed maintenance -> updates plan, updates vehicle real km if newer, and auto-creates linked expense (Section 4 & 9)
app.post('/api/maintenance-history', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;
  if (!body.vehicleId || !body.serviceName || body.executionKm === undefined || !body.executionDate) {
    res.status(400).json({ error: 'Veículo, serviço, data e quilometragem real são obrigatórios.' });
    return;
  }

  const vehicle = db.vehicles.find((v) => v.id === body.vehicleId && !v.isDeleted);
  if (!vehicle) {
    res.status(404).json({ error: 'Veículo não encontrado.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const executionKm = Number(body.executionKm);
  const costCents = Math.round(Number(body.costCents || 0));
  const historyId = crypto.randomUUID();
  const expenseId = costCents > 0 ? crypto.randomUUID() : undefined;

  const historyEntry: MaintenanceHistory = {
    id: historyId,
    planId: body.planId || null,
    vehicleId: vehicle.id,
    serviceName: String(body.serviceName).trim(),
    category: String(body.category || 'Manutenção').trim(),
    components: Array.isArray(body.components) ? body.components : [],
    executionDate: body.executionDate,
    executionKm,
    costCents,
    provider: body.provider ? String(body.provider).trim() : undefined,
    notes: body.notes || undefined,
    attachmentName: body.attachmentName || undefined,
    attachmentData: body.attachmentData || undefined,
    expenseId,
    createdAt: nowIso,
  };

  db.maintenanceHistory.unshift(historyEntry);

  // 1. Update linked MaintenancePlan so next prediction is automatically recalculated
  if (body.planId) {
    const plan = db.maintenancePlans.find((p) => p.id === body.planId);
    if (plan) {
      plan.lastMaintenanceKm = executionKm;
      plan.lastMaintenanceDate = body.executionDate;
      plan.updatedAt = nowIso;
    }
  }

  // 2. Log odometer reading & update real mileage if applicable
  db.mileageLogs.push({
    id: crypto.randomUUID(),
    vehicleId: vehicle.id,
    km: executionKm,
    readingDate: body.executionDate,
    source: 'manutencao',
    notes: `Manutenção executada: ${historyEntry.serviceName}`,
    createdAt: nowIso,
  });

  if (body.executionDate >= vehicle.lastKmUpdateDate && executionKm >= vehicle.currentKm) {
    vehicle.currentKm = executionKm;
    vehicle.lastKmUpdateDate = body.executionDate;
    vehicle.updatedAt = nowIso;
  }

  // 3. Automatically feed vehicle Expenses without duplication (Section 9)
  if (expenseId && costCents > 0) {
    const newExpense: Expense = {
      id: expenseId,
      vehicleId: vehicle.id,
      category: 'Manutenção',
      description: `${historyEntry.serviceName}${historyEntry.provider ? ` (${historyEntry.provider})` : ''}`,
      amountCents: costCents,
      date: body.executionDate,
      status: 'paga',
      maintenanceHistoryId: historyId,
      attachmentName: body.attachmentName || undefined,
      attachmentData: body.attachmentData || undefined,
      notes: body.notes || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.expenses.unshift(newExpense);
  }

  addAuditLog(
    db,
    'manutencao',
    historyId,
    'baixa_manutencao',
    `Manutenção "${historyEntry.serviceName}" realizada no veículo ${vehicle.plate} aos ${executionKm} km`
  );
  saveDb(db);
  res.status(201).json(historyEntry);
});

// --- CLIENTS CRUD ---
app.post('/api/clients', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;
  if (!body.fullName || !body.document) {
    res.status(400).json({ error: 'Nome completo e CPF/CNPJ são obrigatórios.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const newClient: Client = {
    id: crypto.randomUUID(),
    fullName: String(body.fullName).trim(),
    document: String(body.document).trim(),
    phone: String(body.phone || '').trim(),
    whatsapp: String(body.whatsapp || body.phone || '').trim(),
    email: String(body.email || '').trim(),
    address: String(body.address || '').trim(),
    cnhNumber: body.cnhNumber ? String(body.cnhNumber).trim() : undefined,
    cnhExpiry: body.cnhExpiry || undefined,
    notes: body.notes || undefined,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    isDeleted: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.clients.push(newClient);
  addAuditLog(db, 'cliente', newClient.id, 'criacao', `Cliente ${newClient.fullName} cadastrado`);
  saveDb(db);
  res.status(201).json(newClient);
});

app.put('/api/clients/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const client = db.clients.find((c) => c.id === req.params.id && !c.isDeleted);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }

  const body = req.body;
  client.fullName = body.fullName !== undefined ? String(body.fullName).trim() : client.fullName;
  client.document = body.document !== undefined ? String(body.document).trim() : client.document;
  client.phone = body.phone !== undefined ? String(body.phone).trim() : client.phone;
  client.whatsapp = body.whatsapp !== undefined ? String(body.whatsapp).trim() : client.whatsapp;
  client.email = body.email !== undefined ? String(body.email).trim() : client.email;
  client.address = body.address !== undefined ? String(body.address).trim() : client.address;
  client.cnhNumber = body.cnhNumber !== undefined ? String(body.cnhNumber).trim() : client.cnhNumber;
  client.cnhExpiry = body.cnhExpiry !== undefined ? body.cnhExpiry : client.cnhExpiry;
  client.notes = body.notes !== undefined ? body.notes : client.notes;
  if (Array.isArray(body.attachments)) {
    client.attachments = body.attachments;
  }
  client.updatedAt = new Date().toISOString();

  addAuditLog(db, 'cliente', client.id, 'edicao', `Cadastro do cliente ${client.fullName} atualizado`);
  saveDb(db);
  res.json(client);
});

app.delete('/api/clients/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const client = db.clients.find((c) => c.id === req.params.id && !c.isDeleted);
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }
  client.isDeleted = true;
  client.updatedAt = new Date().toISOString();
  addAuditLog(db, 'cliente', client.id, 'exclusao', `Cliente ${client.fullName} removido logicamente`);
  saveDb(db);
  res.json({ ok: true });
});

// --- CONTRACTS & AUTOMATIC INSTALLMENT GENERATION ---
app.post('/api/contracts', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;

  if (!body.clientId || !body.vehicleId || !body.startDate || body.amountCents === undefined) {
    res.status(400).json({ error: 'Cliente, veículo, data inicial e valor da locação são obrigatórios.' });
    return;
  }

  const vehicle = db.vehicles.find((v) => v.id === body.vehicleId && !v.isDeleted);
  if (!vehicle) {
    res.status(404).json({ error: 'Veículo não encontrado.' });
    return;
  }

  const isIndefinite = Boolean(body.isIndefinite);
  const endDate = isIndefinite ? null : body.endDate || null;

  if (!isIndefinite && !endDate) {
    res.status(400).json({ error: 'Informe a data prevista de término ou marque o contrato como prazo indeterminado.' });
    return;
  }

  // Prevent conflicting active contracts on the same vehicle (Section 8)
  const conflict = hasContractPeriodConflict(db.contracts, {
    vehicleId: body.vehicleId,
    startDate: body.startDate,
    endDate,
    isIndefinite,
    status: body.status || 'ativo',
  });

  if (conflict) {
    res.status(400).json({
      error: `Este veículo já possui um contrato ativo no período (${conflict.startDate.split('-').reverse().join('/')} a ${conflict.isIndefinite ? 'Indeterminado' : conflict.endDate?.split('-').reverse().join('/')}).`,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const todayIso = getTodayIso();
  const deliveryKm = body.deliveryKm !== undefined && body.deliveryKm !== '' ? Number(body.deliveryKm) : vehicle.currentKm;

  const newContract: Contract = {
    id: crypto.randomUUID(),
    clientId: body.clientId,
    vehicleId: body.vehicleId,
    startDate: body.startDate,
    endDate,
    isIndefinite,
    amountCents: Math.round(Number(body.amountCents)),
    frequency: body.frequency || 'semanal',
    weeklyDay: body.weeklyDay !== undefined && body.weeklyDay !== null && body.weeklyDay !== '' ? Number(body.weeklyDay) : null,
    monthlyDay: body.monthlyDay !== undefined && body.monthlyDay !== null && body.monthlyDay !== '' ? Number(body.monthlyDay) : null,
    customIntervalDays:
      body.customIntervalDays !== undefined && body.customIntervalDays !== null && body.customIntervalDays !== ''
        ? Number(body.customIntervalDays)
        : null,
    monthEndRule: body.monthEndRule || db.settings.defaultMonthEndRule || 'ultimo_dia_valido',
    firstDueDate: body.firstDueDate || null,
    indefiniteWindowDays:
      body.indefiniteWindowDays !== undefined && body.indefiniteWindowDays !== null && body.indefiniteWindowDays !== ''
        ? Number(body.indefiniteWindowDays)
        : db.settings.defaultIndefiniteWindowDays,
    deliveryKm,
    returnKm: null,
    returnDate: null,
    paymentMethod: body.paymentMethod || db.settings.paymentMethods[0] || 'PIX',
    status: body.status || 'ativo',
    notes: body.notes || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.contracts.unshift(newContract);

  // Update vehicle status and delivery mileage if applicable
  if (newContract.status === 'ativo') {
    vehicle.status = 'alugado';
  }
  if (deliveryKm >= vehicle.currentKm) {
    vehicle.currentKm = deliveryKm;
    vehicle.lastKmUpdateDate = newContract.startDate;
    db.mileageLogs.push({
      id: crypto.randomUUID(),
      vehicleId: vehicle.id,
      km: deliveryKm,
      readingDate: newContract.startDate,
      source: 'contrato_entrega',
      notes: 'Quilometragem na entrega do contrato',
      createdAt: nowIso,
    });
  }

  // Generate recurring installments automatically without duplicates (Section 5)
  const dueDates = generateContractDueDates(newContract, todayIso);
  const generatedInstallments: Installment[] = [];

  dueDates.forEach((dueDate, index) => {
    const exists = db.installments.some(
      (inst) => inst.contractId === newContract.id && inst.dueDate === dueDate && inst.status !== 'cancelada'
    );
    if (!exists) {
      const inst: Installment = {
        id: crypto.randomUUID(),
        contractId: newContract.id,
        clientId: newContract.clientId,
        vehicleId: newContract.vehicleId,
        installmentNumber: index + 1,
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
      };
      db.installments.push(inst);
      generatedInstallments.push(inst);
    }
  });

  addAuditLog(
    db,
    'contrato',
    newContract.id,
    'criacao',
    `Contrato criado para o veículo ${vehicle.plate} com ${generatedInstallments.length} parcela(s) gerada(s)`
  );
  saveDb(db);
  res.status(201).json({ contract: newContract, generatedInstallmentsCount: generatedInstallments.length });
});

// Close / Finish Contract -> records real return Km and allows updating daily average based on rental data (Section 8)
app.post('/api/contracts/:id/close', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const contract = db.contracts.find((c) => c.id === req.params.id);
  if (!contract) {
    res.status(404).json({ error: 'Contrato não encontrado.' });
    return;
  }

  const { returnKm, returnDate, updateVehicleDailyAvg, cancelFuturePendingInstallments } = req.body;
  const parsedReturnKm = Number(returnKm);
  if (Number.isNaN(parsedReturnKm) || parsedReturnKm < contract.deliveryKm) {
    res.status(400).json({ error: 'Informe uma quilometragem de devolução válida (maior ou igual à de entrega).' });
    return;
  }

  const nowIso = new Date().toISOString();
  const closeDateIso = returnDate || getTodayIso();

  contract.returnKm = parsedReturnKm;
  contract.returnDate = closeDateIso;
  contract.status = 'encerrado';
  contract.updatedAt = nowIso;

  const vehicle = db.vehicles.find((v) => v.id === contract.vehicleId);
  if (vehicle) {
    vehicle.status = 'disponivel';
    vehicle.currentKm = parsedReturnKm;
    vehicle.lastKmUpdateDate = closeDateIso;
    vehicle.updatedAt = nowIso;

    db.mileageLogs.push({
      id: crypto.randomUUID(),
      vehicleId: vehicle.id,
      km: parsedReturnKm,
      readingDate: closeDateIso,
      source: 'contrato_devolucao',
      notes: `Devolução de contrato (Início: ${contract.deliveryKm} km -> Fim: ${parsedReturnKm} km)`,
      createdAt: nowIso,
    });

    if (updateVehicleDailyAvg) {
      const rentalDays = Math.max(1, daysBetween(contract.startDate, closeDateIso));
      const rentalKmDiff = parsedReturnKm - contract.deliveryKm;
      if (rentalKmDiff >= 0) {
        vehicle.manualDailyKmAvg = Math.round((rentalKmDiff / rentalDays) * 100) / 100;
      }
    }
  }

  if (cancelFuturePendingInstallments) {
    for (const inst of db.installments) {
      if (inst.contractId === contract.id && inst.dueDate > closeDateIso && inst.paidAmountCents === 0) {
        inst.status = 'cancelada';
        inst.updatedAt = nowIso;
      }
    }
  }

  addAuditLog(
    db,
    'contrato',
    contract.id,
    'edicao',
    `Contrato encerrado com quilometragem de devolução de ${parsedReturnKm} km`
  );
  saveDb(db);
  res.json(contract);
});

// Generate more installments for an indefinite contract
app.post('/api/contracts/:id/generate-more', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const contract = db.contracts.find((c) => c.id === req.params.id);
  if (!contract) {
    res.status(404).json({ error: 'Contrato não encontrado.' });
    return;
  }

  const windowDays = Number(req.body.windowDays || contract.indefiniteWindowDays || 30);
  const existingForContract = db.installments
    .filter((i) => i.contractId === contract.id && i.status !== 'cancelada')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const lastDueDate =
    existingForContract.length > 0 ? existingForContract[existingForContract.length - 1].dueDate : contract.startDate;

  const tempContract: Contract = {
    ...contract,
    indefiniteWindowDays: windowDays,
  };

  const candidateDates = generateContractDueDates(tempContract, lastDueDate);
  const nowIso = new Date().toISOString();
  const todayIso = getTodayIso();
  let maxNumber = existingForContract.reduce((max, i) => Math.max(max, i.installmentNumber), 0);
  let added = 0;

  for (const dueDate of candidateDates) {
    const duplicate = db.installments.some(
      (i) => i.contractId === contract.id && i.dueDate === dueDate && i.status !== 'cancelada'
    );
    if (!duplicate) {
      maxNumber += 1;
      db.installments.push({
        id: crypto.randomUUID(),
        contractId: contract.id,
        clientId: contract.clientId,
        vehicleId: contract.vehicleId,
        installmentNumber: maxNumber,
        dueDate,
        expectedAmountCents: contract.amountCents,
        discountCents: 0,
        surchargeCents: 0,
        paidAmountCents: 0,
        lastPaymentDate: null,
        paymentMethod: contract.paymentMethod || 'PIX',
        status: dueDate < todayIso ? 'vencida' : 'pendente',
        payments: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      added += 1;
    }
  }

  saveDb(db);
  res.json({ added });
});

// --- INSTALLMENTS & RECEIVABLES ---
app.post('/api/installments', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;
  if (!body.clientId || !body.vehicleId || !body.dueDate || body.expectedAmountCents === undefined) {
    res.status(400).json({ error: 'Cliente, veículo, vencimento e valor são obrigatórios.' });
    return;
  }

  // Prevent exact duplicate receivable on same contract + dueDate
  if (
    body.contractId &&
    db.installments.some(
      (i) => i.contractId === body.contractId && i.dueDate === body.dueDate && i.status !== 'cancelada'
    )
  ) {
    res.status(400).json({ error: 'Já existe uma parcela ativa nesta data para este contrato.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const todayIso = getTodayIso();
  const clientInstallmentsCount = db.installments.filter((i) => i.clientId === body.clientId).length;

  const newInst: Installment = {
    id: crypto.randomUUID(),
    contractId: body.contractId || null,
    clientId: body.clientId,
    vehicleId: body.vehicleId,
    installmentNumber: Number(body.installmentNumber) || clientInstallmentsCount + 1,
    dueDate: body.dueDate,
    expectedAmountCents: Math.round(Number(body.expectedAmountCents)),
    discountCents: Math.round(Number(body.discountCents || 0)),
    surchargeCents: Math.round(Number(body.surchargeCents || 0)),
    paidAmountCents: 0,
    lastPaymentDate: null,
    paymentMethod: body.paymentMethod || 'PIX',
    status: body.dueDate < todayIso ? 'vencida' : 'pendente',
    notes: body.notes || undefined,
    payments: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.installments.push(newInst);
  addAuditLog(db, 'parcela', newInst.id, 'criacao', `Cobrança avulsa #${newInst.installmentNumber} criada com vencimento em ${newInst.dueDate}`);
  saveDb(db);
  res.status(201).json(newInst);
});

// Register payment (full, partial, early, or late) & manual discount/surcharge
app.post('/api/installments/:id/pay', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const inst = db.installments.find((i) => i.id === req.params.id);
  if (!inst) {
    res.status(404).json({ error: 'Parcela não encontrada.' });
    return;
  }

  const { amountCents, paymentDate, paymentMethod, discountCents, surchargeCents, notes } = req.body;
  const parsedAmount = Math.round(Number(amountCents || 0));
  if (parsedAmount <= 0) {
    res.status(400).json({ error: 'Informe um valor recebido maior que zero.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const todayIso = getTodayIso();

  if (discountCents !== undefined) inst.discountCents = Math.max(0, Math.round(Number(discountCents)));
  if (surchargeCents !== undefined) inst.surchargeCents = Math.max(0, Math.round(Number(surchargeCents)));

  const paymentRecord = {
    id: crypto.randomUUID(),
    installmentId: inst.id,
    amountCents: parsedAmount,
    paymentDate: paymentDate || todayIso,
    paymentMethod: paymentMethod || inst.paymentMethod || 'PIX',
    notes: notes || undefined,
    createdAt: nowIso,
  };

  inst.payments.push(paymentRecord);
  inst.paidAmountCents = inst.payments.reduce((sum, p) => sum + p.amountCents, 0);
  inst.lastPaymentDate = paymentRecord.paymentDate;
  inst.paymentMethod = paymentRecord.paymentMethod;
  if (notes) inst.notes = notes;
  inst.status = evaluateInstallmentStatus(inst, todayIso);
  inst.updatedAt = nowIso;

  addAuditLog(
    db,
    'parcela',
    inst.id,
    'pagamento',
    `Recebimento de R$ ${(parsedAmount / 100).toFixed(2)} registrado na parcela #${inst.installmentNumber} (Status: ${inst.status})`
  );
  saveDb(db);
  res.json(inst);
});

// Edit / Reschedule installment dueDate, discount, surcharge, or cancel
app.put('/api/installments/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const inst = db.installments.find((i) => i.id === req.params.id);
  if (!inst) {
    res.status(404).json({ error: 'Parcela não encontrada.' });
    return;
  }

  const body = req.body;
  if (body.dueDate !== undefined) inst.dueDate = body.dueDate;
  if (body.expectedAmountCents !== undefined) inst.expectedAmountCents = Math.round(Number(body.expectedAmountCents));
  if (body.discountCents !== undefined) inst.discountCents = Math.max(0, Math.round(Number(body.discountCents)));
  if (body.surchargeCents !== undefined) inst.surchargeCents = Math.max(0, Math.round(Number(body.surchargeCents)));
  if (body.paymentMethod !== undefined) inst.paymentMethod = body.paymentMethod;
  if (body.notes !== undefined) inst.notes = body.notes;
  if (body.status === 'cancelada') {
    inst.status = 'cancelada';
  } else {
    inst.status = evaluateInstallmentStatus({ ...inst, status: 'pendente' }, getTodayIso());
  }

  inst.updatedAt = new Date().toISOString();
  addAuditLog(db, 'parcela', inst.id, 'edicao', `Parcela #${inst.installmentNumber} atualizada (Vencimento: ${inst.dueDate})`);
  saveDb(db);
  res.json(inst);
});

// --- EXPENSES CRUD ---
app.post('/api/expenses', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;
  if (!body.vehicleId || !body.category || !body.description || body.amountCents === undefined || !body.date) {
    res.status(400).json({ error: 'Veículo, categoria, descrição, valor e data são obrigatórios.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const newExp: Expense = {
    id: crypto.randomUUID(),
    vehicleId: body.vehicleId,
    category: body.category,
    description: String(body.description).trim(),
    amountCents: Math.round(Number(body.amountCents)),
    date: body.date,
    status: body.status || 'paga',
    maintenanceHistoryId: null,
    attachmentName: body.attachmentName || undefined,
    attachmentData: body.attachmentData || undefined,
    notes: body.notes || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.expenses.unshift(newExp);
  addAuditLog(db, 'despesa', newExp.id, 'criacao', `Despesa "${newExp.description}" (${newExp.category}) lançada`);
  saveDb(db);
  res.status(201).json(newExp);
});

app.delete('/api/expenses/:id', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const idx = db.expenses.findIndex((e) => e.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Despesa não encontrada.' });
    return;
  }
  const removed = db.expenses.splice(idx, 1)[0];
  addAuditLog(db, 'despesa', removed.id, 'exclusao', `Despesa "${removed.description}" removida`);
  saveDb(db);
  res.json({ ok: true });
});

// --- SETTINGS ---
app.put('/api/settings', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body;

  db.settings = {
    ...db.settings,
    ...body,
    alertMaintenanceKmBefore:
      body.alertMaintenanceKmBefore === '' || body.alertMaintenanceKmBefore === null || body.alertMaintenanceKmBefore === undefined
        ? null
        : Number(body.alertMaintenanceKmBefore),
    alertMaintenanceDaysBefore:
      body.alertMaintenanceDaysBefore === '' || body.alertMaintenanceDaysBefore === null || body.alertMaintenanceDaysBefore === undefined
        ? null
        : Number(body.alertMaintenanceDaysBefore),
    alertPaymentDaysBefore:
      body.alertPaymentDaysBefore === '' || body.alertPaymentDaysBefore === null || body.alertPaymentDaysBefore === undefined
        ? null
        : Number(body.alertPaymentDaysBefore),
    alertContractEndDaysBefore:
      body.alertContractEndDaysBefore === '' || body.alertContractEndDaysBefore === null || body.alertContractEndDaysBefore === undefined
        ? null
        : Number(body.alertContractEndDaysBefore),
    defaultIndefiniteWindowDays:
      body.defaultIndefiniteWindowDays === '' || body.defaultIndefiniteWindowDays === null || body.defaultIndefiniteWindowDays === undefined
        ? null
        : Number(body.defaultIndefiniteWindowDays),
  };

  addAuditLog(db, 'configuracao', 'settings', 'edicao', 'Configurações gerais da locadora atualizadas');
  saveDb(db);
  res.json(db.settings);
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[FleetRental Server] Rodando na porta http://localhost:${PORT}`);
});

