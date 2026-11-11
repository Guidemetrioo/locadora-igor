export type VehicleStatus = 'disponivel' | 'alugado' | 'manutencao' | 'inativo';
export type AvgCalculationMode = 'manual' | 'calculated';

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  manufacturingYear: number;
  modelYear: number;
  plate: string;
  color: string;
  renavam?: string;
  chassis?: string;
  photoUrl?: string;
  acquisitionDate?: string; // YYYY-MM-DD
  acquisitionValueCents?: number;
  status: VehicleStatus;
  currentKm: number;
  lastKmUpdateDate: string; // YYYY-MM-DD
  manualDailyKmAvg: number | null; // null if not yet configured by user
  avgCalculationMode: AvgCalculationMode;
  notes?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MileageLog {
  id: string;
  vehicleId: string;
  km: number;
  readingDate: string; // YYYY-MM-DD
  source: 'manual' | 'contrato_entrega' | 'contrato_devolucao' | 'manutencao' | 'cadastro_inicial';
  notes?: string;
  createdAt: string;
}

export type MaintenanceAlertState = 'em_dia' | 'proxima' | 'vencida' | 'indisponivel';

export interface MaintenancePlan {
  id: string;
  vehicleId: string;
  name: string; // e.g., Troca de óleo do motor, Pastilhas de freio
  category: string; // e.g., Motor, Freios, Pneus, Revisão, Suspensão, Outros
  components: string[]; // e.g., ["Óleo do motor", "Filtro de óleo"]
  lastMaintenanceKm: number | null;
  lastMaintenanceDate: string | null; // YYYY-MM-DD
  intervalKm: number | null; // Configurable manually, no default imposed
  intervalDays: number | null; // Configurable manually
  intervalMonths: number | null; // Configurable manually
  estimatedCostCents: number | null;
  customAlertKmBefore: number | null; // Optional override for this plan
  customAlertDaysBefore: number | null; // Optional override for this plan
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceProjection {
  planId: string;
  vehicleId: string;
  activeDailyKmAvg: number | null;
  projectedCurrentKm: number;
  nextMaintenanceKm: number | null;
  remainingKm: number | null;
  remainingDaysByKm: number | null;
  estimatedDateByKm: string | null; // YYYY-MM-DD
  estimatedDateByTime: string | null; // YYYY-MM-DD
  remainingDaysByTime: number | null;
  effectiveRemainingDays: number | null;
  effectiveEstimatedDate: string | null; // YYYY-MM-DD
  limitingCriterion: 'km' | 'tempo' | 'indisponivel';
  missingDataReasons: string[];
  status: MaintenanceAlertState;
}

export interface MaintenanceHistory {
  id: string;
  planId?: string | null;
  vehicleId: string;
  serviceName: string;
  category: string;
  components: string[];
  executionDate: string; // YYYY-MM-DD
  executionKm: number;
  costCents: number;
  provider?: string;
  notes?: string;
  attachmentName?: string;
  attachmentData?: string; // Base64 or URL
  expenseId?: string; // Linked expense to prevent duplicate entry
  createdAt: string;
}

export interface ClientAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl?: string;
  uploadedAt: string;
}

export interface Client {
  id: string;
  fullName: string;
  document: string; // CPF or CNPJ
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  cnhNumber?: string;
  cnhExpiry?: string; // YYYY-MM-DD
  notes?: string;
  attachments: ClientAttachment[];
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BillingFrequency = 'semanal' | 'quinzenal' | 'mensal' | 'personalizado';
export type MonthEndRule = 'ultimo_dia_valido' | 'proximo_dia_util';
export type ContractStatus = 'ativo' | 'encerrado' | 'cancelado';

export interface Contract {
  id: string;
  clientId: string;
  vehicleId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD or null if indefinite
  isIndefinite: boolean;
  amountCents: number; // Rental installment value in cents
  frequency: BillingFrequency;
  weeklyDay: number | null; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  monthlyDay: number | null; // 1..31
  customIntervalDays: number | null; // e.g., 10 days, 20 days
  monthEndRule: MonthEndRule;
  firstDueDate?: string | null; // Optional explicit initial charge date
  indefiniteWindowDays: number | null; // Configurable window to generate future installments for indefinite contracts
  deliveryKm: number;
  returnKm: number | null;
  returnDate: string | null;
  paymentMethod?: string;
  status: ContractStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type InstallmentStatus = 'pendente' | 'parcialmente_paga' | 'paga' | 'vencida' | 'cancelada';

export interface InstallmentPaymentRecord {
  id: string;
  installmentId: string;
  amountCents: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod: string;
  notes?: string;
  createdAt: string;
}

export interface Installment {
  id: string;
  contractId: string | null; // Can be linked to a contract or standalone receivable
  clientId: string;
  vehicleId: string;
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  expectedAmountCents: number; // Original value
  discountCents: number; // Manual discount
  surchargeCents: number; // Manual addition/fee (never automatic)
  paidAmountCents: number; // Sum of received payments
  lastPaymentDate: string | null; // YYYY-MM-DD
  paymentMethod: string;
  status: InstallmentStatus;
  notes?: string;
  payments: InstallmentPaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  vehicleId: string;
  category: string; // Manutenção, Seguro, IPVA, Licenciamento, Multas, Limpeza, Outros
  description: string;
  amountCents: number;
  date: string; // YYYY-MM-DD
  status: 'paga' | 'pendente';
  maintenanceHistoryId?: string | null; // Prevents duplicate when created from Maintenance
  attachmentName?: string;
  attachmentData?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceTemplateItem {
  id: string;
  name: string;
  category: string;
  defaultComponents: string[];
  intervalKm: number | null; // Null by default; user can optionally set in settings
  intervalDays: number | null;
  intervalMonths: number | null;
}

export interface SystemSettings {
  companyName: string;
  companyDocument: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  adminName: string;
  adminRole: string;
  // Alert parameters (user configurable, can be null until configured or changed)
  alertMaintenanceKmBefore: number | null;
  alertMaintenanceDaysBefore: number | null;
  alertPaymentDaysBefore: number | null;
  alertContractEndDaysBefore: number | null;
  // Billing & Rules
  defaultMonthEndRule: MonthEndRule;
  defaultIndefiniteWindowDays: number | null;
  paymentMethods: string[];
  expenseCategories: string[];
  maintenanceCategories: string[];
  commonComponents: string[];
  maintenanceTemplates: MaintenanceTemplateItem[];
}

export interface AuditLog {
  id: string;
  entityType: 'veiculo' | 'cliente' | 'contrato' | 'parcela' | 'manutencao' | 'despesa' | 'configuracao';
  entityId: string;
  action: 'criacao' | 'edicao' | 'exclusao' | 'pagamento' | 'baixa_manutencao';
  description: string;
  timestamp: string;
}

export interface SystemNotification {
  id: string;
  type: 'pagamento_proximo' | 'pagamento_vencido' | 'manutencao_proxima' | 'manutencao_vencida' | 'contrato_encerrando';
  severity: 'warning' | 'danger' | 'info';
  title: string;
  message: string;
  entityId: string;
  vehicleId?: string;
  clientId?: string;
  dueDate?: string;
}

