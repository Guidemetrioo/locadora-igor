import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
} from '../shared/types';

export interface DatabaseSchema {
  auth: {
    username: string;
    passwordHash: string;
    tokens: string[];
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`fleet_salt_${password}`).digest('hex');
}

export function createInitialEmptyDatabase(): DatabaseSchema {
  return {
    auth: {
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      tokens: [],
    },
    settings: {
      companyName: 'Minha Locadora',
      companyDocument: '',
      companyPhone: '',
      companyEmail: '',
      companyAddress: '',
      adminName: 'Administrador',
      adminRole: 'Gestor da Frota',
      // No mandatory intervals or values pre-forced; alert thresholds can be configured freely by admin
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
      // Optional service catalog templates WITHOUT mandatory intervals (intervalKm/Days = null)
      maintenanceTemplates: [
        {
          id: 'tpl-oleo',
          name: 'Troca de óleo do motor',
          category: 'Motor',
          defaultComponents: ['Troca de óleo do motor', 'Troca do filtro de óleo'],
          intervalKm: null,
          intervalDays: null,
          intervalMonths: null,
        },
        {
          id: 'tpl-filtros',
          name: 'Troca de filtros (Ar e Combustível)',
          category: 'Filtros',
          defaultComponents: ['Troca do filtro de ar', 'Troca do filtro de combustível'],
          intervalKm: null,
          intervalDays: null,
          intervalMonths: null,
        },
        {
          id: 'tpl-freios',
          name: 'Revisão de freios (Pastilhas e Discos)',
          category: 'Freios',
          defaultComponents: ['Troca das pastilhas de freio', 'Troca dos discos de freio', 'Troca de fluido de freio'],
          intervalKm: null,
          intervalDays: null,
          intervalMonths: null,
        },
        {
          id: 'tpl-pneus',
          name: 'Pneus, Alinhamento e Balanceamento',
          category: 'Pneus e Rodas',
          defaultComponents: ['Troca de pneus', 'Alinhamento', 'Balanceamento'],
          intervalKm: null,
          intervalDays: null,
          intervalMonths: null,
        },
        {
          id: 'tpl-correia',
          name: 'Troca de correia e Revisão Geral',
          category: 'Revisão Geral',
          defaultComponents: ['Troca de correia', 'Revisão geral'],
          intervalKm: null,
          intervalDays: null,
          intervalMonths: null,
        },
      ],
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

let cachedDb: DatabaseSchema | null = null;

export function getDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialEmptyDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    cachedDb = initial;
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    cachedDb = JSON.parse(raw) as DatabaseSchema;
    return cachedDb;
  } catch (err) {
    const initial = createInitialEmptyDatabase();
    cachedDb = initial;
    return cachedDb;
  }
}

export function saveDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  cachedDb = db;
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

export function addAuditLog(
  db: DatabaseSchema,
  entityType: AuditLog['entityType'],
  entityId: string,
  action: AuditLog['action'],
  description: string
): void {
  db.auditLogs.unshift({
    id: crypto.randomUUID(),
    entityType,
    entityId,
    action,
    description,
    timestamp: new Date().toISOString(),
  });
  // Keep last 500 audit logs
  if (db.auditLogs.length > 500) {
    db.auditLogs.length = 500;
  }
}

