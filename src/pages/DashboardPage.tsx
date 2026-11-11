import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Car,
  Wrench,
  AlertTriangle,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Plus,
  ChevronRight,
  Users,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatCurrencyBRL,
  formatBRDate,
  getInstallmentNetTotalCents,
  getInstallmentOpenBalanceCents,
  daysBetween,
} from '../../shared/calculations';
import {
  getVehicleThumb,
  VehicleStatusBadge,
  MaintenanceStatePill,
  InstallmentStatusBadge,
} from '../components/UiBadges';

export function DashboardPage() {
  const { data } = useApp();
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const today = data?.todayIso || new Date().toISOString().slice(0, 10);
    return Number(today.slice(0, 4));
  });
  const [fleetFilter, setFleetFilter] = useState<string>('todos');

  if (!data) return null;

  const todayIso = data.todayIso;
  const currentMonthPrefix = todayIso.slice(0, 7); // YYYY-MM

  // --- 1. FINANCIAL INDICATORS (Section 2) ---
  const financialStats = useMemo(() => {
    let expectedThisMonthCents = 0;
    let receivedThisMonthCents = 0;
    let openThisMonthCents = 0;
    let overdueCount = 0;
    let overdueTotalCents = 0;
    let dueTodayCents = 0;
    let dueNext7DaysCents = 0;
    let dueNext30DaysCents = 0;

    for (const inst of data.installments) {
      if (inst.status === 'cancelada') continue;
      const netCents = getInstallmentNetTotalCents(inst);
      const openCents = getInstallmentOpenBalanceCents(inst);

      // Payments received during the current month (by payment record date or installment due month)
      for (const p of inst.payments || []) {
        if (p.paymentDate.startsWith(currentMonthPrefix)) {
          receivedThisMonthCents += p.amountCents;
        }
      }

      if (inst.dueDate.startsWith(currentMonthPrefix)) {
        expectedThisMonthCents += netCents;
        openThisMonthCents += openCents;
      }

      if (openCents > 0) {
        const diff = daysBetween(todayIso, inst.dueDate);
        if (diff < 0) {
          overdueCount += 1;
          overdueTotalCents += openCents;
        } else if (diff === 0) {
          dueTodayCents += openCents;
          dueNext7DaysCents += openCents;
          dueNext30DaysCents += openCents;
        } else {
          if (diff <= 7) dueNext7DaysCents += openCents;
          if (diff <= 30) dueNext30DaysCents += openCents;
        }
      }
    }

    // Expenses in the current month
    let maintenanceExpensesThisMonthCents = 0;
    let totalExpensesThisMonthCents = 0;
    for (const exp of data.expenses) {
      if (exp.date.startsWith(currentMonthPrefix)) {
        totalExpensesThisMonthCents += exp.amountCents;
        if (exp.category === 'Manutenção' || exp.maintenanceHistoryId) {
          maintenanceExpensesThisMonthCents += exp.amountCents;
        }
      }
    }

    const monthlyOperationalResultCents = receivedThisMonthCents - totalExpensesThisMonthCents;

    return {
      expectedThisMonthCents,
      receivedThisMonthCents,
      openThisMonthCents,
      overdueCount,
      overdueTotalCents,
      dueTodayCents,
      dueNext7DaysCents,
      dueNext30DaysCents,
      maintenanceExpensesThisMonthCents,
      totalExpensesThisMonthCents,
      monthlyOperationalResultCents,
    };
  }, [data.installments, data.expenses, currentMonthPrefix, todayIso]);

  // --- 2. FLEET INDICATORS (Section 2) ---
  const fleetStats = useMemo(() => {
    const total = data.vehicles.length;
    const rented = data.vehicles.filter((v) => v.status === 'alugado').length;
    const available = data.vehicles.filter((v) => v.status === 'disponivel').length;
    const inMaintenance = data.vehicles.filter((v) => v.status === 'manutencao').length;

    const vehiclesWithNearMaint = new Set<string>();
    const vehiclesWithOverdueMaint = new Set<string>();

    for (const proj of data.maintenanceProjections) {
      if (proj.status === 'proxima') vehiclesWithNearMaint.add(proj.vehicleId);
      if (proj.status === 'vencida') vehiclesWithOverdueMaint.add(proj.vehicleId);
    }

    return {
      total,
      rented,
      available,
      inMaintenance,
      nearMaintenanceCount: vehiclesWithNearMaint.size,
      overdueMaintenanceCount: vehiclesWithOverdueMaint.size,
    };
  }, [data.vehicles, data.maintenanceProjections]);

  // --- 3. MONTHLY REVENUE VS EXPENSES CHART DATA (Jan - Dec) ---
  const monthlySeries = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return months.map((label, idx) => {
      const prefix = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
      let received = 0;
      let expected = 0;
      let expenses = 0;

      for (const inst of data.installments) {
        if (inst.status === 'cancelada') continue;
        if (inst.dueDate.startsWith(prefix)) {
          expected += getInstallmentNetTotalCents(inst);
        }
        for (const p of inst.payments || []) {
          if (p.paymentDate.startsWith(prefix)) {
            received += p.amountCents;
          }
        }
      }

      for (const exp of data.expenses) {
        if (exp.date.startsWith(prefix)) {
          expenses += exp.amountCents;
        }
      }

      return { label, received, expected, expenses };
    });
  }, [data.installments, data.expenses, selectedYear]);

  const maxChartValue = Math.max(
    10000,
    ...monthlySeries.map((m) => Math.max(m.received, m.expected, m.expenses))
  );

  // Build smooth SVG path for Received Revenue (like Image 2)
  const buildSmoothSvgPath = (values: number[], width: number, height: number): string => {
    if (values.length === 0) return '';
    const pts = values.map((v, idx) => {
      const x = (idx / (values.length - 1)) * width;
      const y = height - (v / maxChartValue) * (height - 28) - 14;
      return { x, y };
    });
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const ctrlX = (curr.x + next.x) / 2;
      d += ` C ${ctrlX} ${curr.y}, ${ctrlX} ${next.y}, ${next.x} ${next.y}`;
    }
    return d;
  };

  const upcomingInstallments = useMemo(() => {
    return [...data.installments]
      .filter((i) => i.status !== 'paga' && i.status !== 'cancelada')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);
  }, [data.installments]);

  const upcomingMaintenances = useMemo(() => {
    return [...data.maintenanceProjections]
      .filter((p) => p.status === 'vencida' || p.status === 'proxima' || p.status === 'em_dia')
      .sort((a, b) => {
        const score = (s: string) => (s === 'vencida' ? 0 : s === 'proxima' ? 1 : 2);
        if (score(a.status) !== score(b.status)) return score(a.status) - score(b.status);
        return (a.remainingKm ?? 999999) - (b.remainingKm ?? 999999);
      })
      .slice(0, 5);
  }, [data.maintenanceProjections]);

  const filteredVehicles = useMemo(() => {
    if (fleetFilter === 'todos') return data.vehicles;
    return data.vehicles.filter((v) => v.status === fleetFilter);
  }, [data.vehicles, fleetFilter]);

  return (
    <div className="space-y-6">
      {/* Welcome Alert Banner (Inspired by Image 2 "Welcome Back, You have X new messages") */}
      <div className="bg-white rounded-3xl p-5 sm:px-7 sm:py-5 shadow-xs border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="z-10">
          <h2 className="text-base sm:text-lg font-bold text-slate-800">
            Bem-vindo de volta!{' '}
            {data.notifications.length > 0 ? (
              <span>
                Você possui{' '}
                <button
                  onClick={() => navigate('/notificacoes')}
                  className="text-blue-600 underline font-extrabold hover:text-blue-700"
                >
                  {data.notifications.length} alerta(s) importante(s)
                </button>{' '}
                no sistema.
              </span>
            ) : (
              <span className="text-slate-500 font-medium">
                Todos os alertas operacionais estão em dia hoje ({formatBRDate(todayIso)}).
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Resumo em tempo real calculado automaticamente com base nos seus veículos, contratos e manutenções.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 z-10">
          <button
            onClick={() => navigate('/frota')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            Novo Veículo
          </button>
          <button
            onClick={() => navigate('/contratos')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            <Plus className="w-4 h-4" />
            Novo Contrato
          </button>
        </div>
      </div>

      {/* Main Layout Grid (Inspired by Image 2: Left 8 cols KPIs + Chart, Right 4 cols Lists) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column (8 cols) */}
        <div className="xl:col-span-8 space-y-6">
          {/* Top 3 Primary KPI Cards (Image 2 style) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KPI 1: Recebido no Mês vs Previsto */}
            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  Recebido Mês
                </span>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {formatCurrencyBRL(financialStats.receivedThisMonthCents)}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>Previsto no mês:</span>
                  <strong className="text-slate-600">
                    {formatCurrencyBRL(financialStats.expectedThisMonthCents)}
                  </strong>
                </div>
              </div>
            </div>

            {/* KPI 2: Resultado Financeiro do Mês */}
            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    financialStats.monthlyOperationalResultCents >= 0
                      ? 'text-emerald-600 bg-emerald-50'
                      : 'text-rose-600 bg-rose-50'
                  }`}
                >
                  {financialStats.monthlyOperationalResultCents >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  Resultado Mês
                </span>
              </div>
              <div>
                <p
                  className={`text-2xl font-extrabold tracking-tight ${
                    financialStats.monthlyOperationalResultCents >= 0 ? 'text-slate-900' : 'text-rose-600'
                  }`}
                >
                  {formatCurrencyBRL(financialStats.monthlyOperationalResultCents)}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>Despesas mês:</span>
                  <strong className="text-rose-600">
                    {formatCurrencyBRL(financialStats.totalExpensesThisMonthCents)}
                  </strong>
                </div>
              </div>
            </div>

            {/* KPI 3: Frota Alugada / Total */}
            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                  {fleetStats.available} disponível(is)
                </span>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {fleetStats.rented} / {fleetStats.total}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>Veículos Alugados</span>
                  <span className="text-amber-600 font-semibold">
                    {fleetStats.inMaintenance} em oficina
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Financial & Fleet Indicators Strip (All required metrics from Section 2) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 block">Em Aberto (Mês)</span>
              <span className="text-sm font-extrabold text-slate-800 mt-1 block">
                {formatCurrencyBRL(financialStats.openThisMonthCents)}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-2xs">
              <span className="text-[11px] font-semibold text-rose-500 block">
                Vencidas ({financialStats.overdueCount})
              </span>
              <span className="text-sm font-extrabold text-rose-600 mt-1 block">
                {formatCurrencyBRL(financialStats.overdueTotalCents)}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-amber-100 shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-600 block">Vencem Hoje</span>
              <span className="text-sm font-extrabold text-amber-700 mt-1 block">
                {formatCurrencyBRL(financialStats.dueTodayCents)}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 block">Próx. 7 Dias</span>
              <span className="text-sm font-extrabold text-blue-600 mt-1 block">
                {formatCurrencyBRL(financialStats.dueNext7DaysCents)}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 block">Próx. 30 Dias</span>
              <span className="text-sm font-extrabold text-slate-800 mt-1 block">
                {formatCurrencyBRL(financialStats.dueNext30DaysCents)}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 block">Custo Manut. (Mês)</span>
              <span className="text-sm font-extrabold text-slate-800 mt-1 block">
                {formatCurrencyBRL(financialStats.maintenanceExpensesThisMonthCents)}
              </span>
            </div>
          </div>

          {/* Revenue & Expenses Smooth Curve Chart (Image 2 Center Card) */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Fluxo Financeiro Anual (Receitas Recebidas vs. Despesas)
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <h3 className="text-2xl font-extrabold text-blue-600">
                    {formatCurrencyBRL(
                      monthlySeries.reduce((acc, item) => acc + item.received, 0)
                    )}
                  </h3>
                  <span className="text-xs text-slate-400">
                    acumulado em {selectedYear}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    Recebido
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Despesas
                  </span>
                </div>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50/70 focus:outline-none"
                >
                  {[selectedYear - 1, selectedYear, selectedYear + 1].map((yr) => (
                    <option key={yr} value={yr}>
                      Jan - Dez {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* SVG Curve Chart */}
            <div className="relative h-56 w-full">
              <svg viewBox="0 0 700 200" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal grid lines */}
                {[0.2, 0.5, 0.8].map((ratio, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    x2="700"
                    y1={200 * ratio}
                    y2={200 * ratio}
                    stroke="#F1F5F9"
                    strokeWidth="1.5"
                  />
                ))}

                {/* Smooth Expense Curve */}
                <path
                  d={buildSmoothSvgPath(
                    monthlySeries.map((m) => m.expenses),
                    700,
                    185
                  )}
                  fill="none"
                  stroke="#F43F5E"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                />

                {/* Smooth Revenue Curve */}
                <path
                  d={buildSmoothSvgPath(
                    monthlySeries.map((m) => m.received),
                    700,
                    185
                  )}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="3.5"
                />

                {/* Data Points */}
                {monthlySeries.map((m, idx) => {
                  const x = (idx / 11) * 700;
                  const y = 185 - (m.received / maxChartValue) * (185 - 28) - 14;
                  return (
                    <g key={m.label} className="group">
                      <circle
                        cx={x}
                        cy={y}
                        r="4.5"
                        className="fill-white stroke-blue-600 stroke-2 cursor-pointer"
                      />
                      <title>{`${m.label}/${selectedYear}: Recebido ${formatCurrencyBRL(m.received)} | Previsto ${formatCurrencyBRL(m.expected)} | Despesas ${formatCurrencyBRL(m.expenses)}`}</title>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="grid grid-cols-12 text-center text-[11px] font-medium text-slate-400 mt-2">
              {monthlySeries.map((m) => (
                <span key={m.label}>{m.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (4 cols: Próximos Recebimentos & Manutenções / Alertas) */}
        <div className="xl:col-span-4 space-y-6">
          {/* Card 1: Próximos Recebimentos / Cobranças (Inspired by Image 2 "Recent Transactions") */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-extrabold text-slate-900">Próximos Recebimentos</h3>
              <button
                onClick={() => navigate('/financeiro')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                Ver Todos
              </button>
            </div>

            {upcomingInstallments.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200">
                <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">Nenhuma parcela pendente</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ao criar um contrato, os vencimentos aparecerão automaticamente aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {upcomingInstallments.map((inst) => {
                  const vehicle = data.vehicles.find((v) => v.id === inst.vehicleId);
                  const client = data.clients.find((c) => c.id === inst.clientId);
                  const openCents = getInstallmentOpenBalanceCents(inst);
                  return (
                    <div
                      key={inst.id}
                      onClick={() => navigate('/financeiro')}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={getVehicleThumb(vehicle?.photoUrl, vehicle?.color)}
                          alt={vehicle?.model || 'Veículo'}
                          className="w-12 h-9 object-contain rounded-xl bg-slate-50 border border-slate-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {client?.fullName || 'Cliente'}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {vehicle ? `${vehicle.model} • ${vehicle.plate}` : 'Veículo'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-extrabold text-slate-900">
                          {formatCurrencyBRL(openCents)}
                        </p>
                        <p
                          className={`text-[10px] font-semibold ${
                            inst.status === 'vencida' ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {formatBRDate(inst.dueDate)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 2: Status das Manutenções Preventivas (Inspired by Image 2 "Top 5" + FleetMax Alerts) */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Próximas Manutenções</h3>
                <p className="text-[11px] text-slate-400">
                  {fleetStats.overdueMaintenanceCount} vencida(s) • {fleetStats.nearMaintenanceCount} próxima(s)
                </p>
              </div>
              <button
                onClick={() => navigate('/manutencoes')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                Gerenciar
              </button>
            </div>

            {upcomingMaintenances.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200">
                <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">Nenhum plano de manutenção</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Configure os intervalos de óleo, filtros ou pneus em Manutenções.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingMaintenances.map((proj) => {
                  const plan = data.maintenancePlans.find((p) => p.id === proj.planId);
                  const vehicle = data.vehicles.find((v) => v.id === proj.vehicleId);
                  if (!plan || !vehicle) return null;

                  const intervalKm = plan.intervalKm || 10000;
                  const remainingKm = proj.remainingKm ?? 0;
                  const progressPct = Math.max(
                    8,
                    Math.min(100, Math.round(((intervalKm - Math.max(0, remainingKm)) / intervalKm) * 100))
                  );

                  return (
                    <div
                      key={proj.planId}
                      onClick={() => navigate('/manutencoes')}
                      className="cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-800 group-hover:text-blue-600 transition truncate">
                          {vehicle.plate} — {plan.name}
                        </span>
                        <span
                          className={`font-bold shrink-0 ml-2 ${
                            proj.status === 'vencida'
                              ? 'text-rose-600'
                              : proj.status === 'proxima'
                              ? 'text-amber-600'
                              : 'text-blue-600'
                          }`}
                        >
                          {proj.remainingKm !== null ? `${proj.remainingKm} km` : '—'}
                          {proj.effectiveRemainingDays !== null ? ` (${proj.effectiveRemainingDays}d)` : ''}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            proj.status === 'vencida'
                              ? 'bg-rose-500'
                              : proj.status === 'proxima'
                              ? 'bg-amber-500'
                              : 'bg-blue-600'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Fleet Table (Inspired by Image 2 "Available Cars" table) */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Visão Rápida da Frota</h3>
            <p className="text-xs text-slate-400">
              Clique em qualquer veículo para abrir a página detalhada com abas de Visão Geral, Financeiro, Manutenções e Histórico.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={fleetFilter}
              onChange={(e) => setFleetFilter(e.target.value)}
              className="px-3.5 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50/70 focus:outline-none"
            >
              <option value="todos">Todos ({data.vehicles.length})</option>
              <option value="disponivel">Disponíveis ({fleetStats.available})</option>
              <option value="alugado">Alugados ({fleetStats.rented})</option>
              <option value="manutencao">Em Manutenção ({fleetStats.inMaintenance})</option>
            </select>
            <button
              onClick={() => navigate('/frota')}
              className="px-4 py-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold transition"
            >
              Gerenciar Frota
            </button>
          </div>
        </div>

        {filteredVehicles.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl bg-slate-50/60 border border-dashed border-slate-200">
            <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-700">Nenhum veículo cadastrado ainda</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
              O sistema inicia sem veículos fictícios. Cadastre seus veículos reais para começar o controle de quilometragem, contratos e manutenções.
            </p>
            <button
              onClick={() => navigate('/frota')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Primeiro Veículo
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-2">Veículo</th>
                  <th className="pb-3">Modelo / Ano</th>
                  <th className="pb-3">Cor</th>
                  <th className="pb-3">Placa</th>
                  <th className="pb-3">Odômetro Real</th>
                  <th className="pb-3">Média Diária</th>
                  <th className="pb-3">Cliente Atual</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right pr-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredVehicles.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => navigate(`/frota/${v.id}`)}
                    className="hover:bg-slate-50/90 transition cursor-pointer"
                  >
                    <td className="py-3.5 pl-2">
                      <img
                        src={getVehicleThumb(v.photoUrl, v.color)}
                        alt={v.model}
                        className="w-16 h-10 object-contain rounded-xl bg-slate-50 border border-slate-100"
                      />
                    </td>
                    <td className="py-3.5 font-bold text-slate-800">
                      {v.brand} {v.model}
                      <span className="block text-xs font-normal text-slate-400">
                        {v.manufacturingYear}/{v.modelYear}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-600 text-xs font-medium">{v.color || '—'}</td>
                    <td className="py-3.5 font-extrabold text-slate-900 tracking-wide">{v.plate}</td>
                    <td className="py-3.5 text-slate-700 font-semibold">
                      {v.currentKm.toLocaleString('pt-BR')} km
                      {v.projectedCurrentKm > v.currentKm && (
                        <span className="block text-[11px] font-normal text-blue-600">
                          Proj: {v.projectedCurrentKm.toLocaleString('pt-BR')} km
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-slate-600 text-xs font-semibold">
                      {v.activeDailyKmAvg !== null ? `${v.activeDailyKmAvg} km/dia` : 'Não informada'}
                    </td>
                    <td className="py-3.5 text-xs text-slate-600">
                      {v.activeClient ? (
                        <span className="font-semibold text-slate-800">{v.activeClient.fullName}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <VehicleStatusBadge status={v.status} />
                    </td>
                    <td className="py-3.5 text-right pr-2">
                      <button className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

