import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Car,
  DollarSign,
  Wrench,
  History,
  Gauge,
  Plus,
  CheckCircle2,
  AlertTriangle,
  User,
  Calendar,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatBRDate,
  formatCurrencyBRL,
  getInstallmentNetTotalCents,
  getInstallmentOpenBalanceCents,
} from '../../shared/calculations';
import {
  getVehicleThumb,
  VehicleStatusBadge,
  MaintenanceStatePill,
  InstallmentStatusBadge,
} from '../components/UiBadges';

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, apiFetch, refreshState, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<'visao_geral' | 'financeiro' | 'manutencoes' | 'historico'>('visao_geral');

  // Inline odometer & daily average form
  const [kmInput, setKmInput] = useState('');
  const [dailyAvgInput, setDailyAvgInput] = useState('');
  const [avgModeInput, setAvgModeInput] = useState<'manual' | 'calculated'>('manual');

  // Quick Expense Modal for this vehicle
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    category: 'Seguro',
    description: '',
    amountBRL: '',
    date: '',
    status: 'paga' as 'paga' | 'pendente',
  });

  if (!data) return null;

  const vehicle = data.vehicles.find((v) => v.id === id);
  if (!vehicle) {
    return (
      <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
        <p className="text-sm font-bold text-slate-700">Veículo não encontrado.</p>
        <button
          onClick={() => navigate('/frota')}
          className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
        >
          Voltar para Minha Frota
        </button>
      </div>
    );
  }

  const vehicleInstallments = useMemo(
    () =>
      data.installments
        .filter((i) => i.vehicleId === vehicle.id && i.status !== 'cancelada')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [data.installments, vehicle.id]
  );

  const vehicleExpenses = useMemo(
    () =>
      data.expenses
        .filter((e) => e.vehicleId === vehicle.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.expenses, vehicle.id]
  );

  const vehiclePlans = useMemo(
    () => data.maintenancePlans.filter((p) => p.vehicleId === vehicle.id),
    [data.maintenancePlans, vehicle.id]
  );

  const vehicleHistory = useMemo(
    () =>
      data.maintenanceHistory
        .filter((h) => h.vehicleId === vehicle.id)
        .sort((a, b) => b.executionDate.localeCompare(a.executionDate)),
    [data.maintenanceHistory, vehicle.id]
  );

  const vehicleContracts = useMemo(
    () =>
      data.contracts
        .filter((c) => c.vehicleId === vehicle.id)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.contracts, vehicle.id]
  );

  const vehicleMileageLogs = useMemo(
    () =>
      data.mileageLogs
        .filter((l) => l.vehicleId === vehicle.id)
        .sort((a, b) => b.readingDate.localeCompare(a.readingDate)),
    [data.mileageLogs, vehicle.id]
  );

  // Vehicle Financial Indicators (Section 9)
  const finMetrics = useMemo(() => {
    const expectedRevenueCents = vehicleInstallments.reduce(
      (sum, i) => sum + getInstallmentNetTotalCents(i),
      0
    );
    const receivedRevenueCents = vehicleInstallments.reduce(
      (sum, i) => sum + (i.paidAmountCents || 0),
      0
    );
    const openRevenueCents = vehicleInstallments.reduce(
      (sum, i) => sum + getInstallmentOpenBalanceCents(i),
      0
    );
    const totalExpensesCents = vehicleExpenses.reduce((sum, e) => sum + e.amountCents, 0);
    const maintenanceExpensesCents = vehicleExpenses
      .filter((e) => e.category === 'Manutenção' || e.maintenanceHistoryId)
      .reduce((sum, e) => sum + e.amountCents, 0);
    const operationalResultCents = receivedRevenueCents - totalExpensesCents;

    return {
      expectedRevenueCents,
      receivedRevenueCents,
      openRevenueCents,
      totalExpensesCents,
      maintenanceExpensesCents,
      operationalResultCents,
    };
  }, [vehicleInstallments, vehicleExpenses]);

  const handleQuickOdometerSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/vehicles/${vehicle.id}/mileage`, {
        method: 'POST',
        body: JSON.stringify({
          km: kmInput !== '' ? Number(kmInput) : vehicle.currentKm,
          readingDate: data.todayIso,
          manualDailyKmAvg:
            dailyAvgInput !== ''
              ? Number(dailyAvgInput.replace(',', '.'))
              : vehicle.manualDailyKmAvg,
          avgCalculationMode: avgModeInput,
          notes: 'Atualização na página individual do veículo',
        }),
      });
      showToast('Quilometragem e média diária atualizadas!');
      setKmInput('');
      setDailyAvgInput('');
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleAddVehicleExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amountCents = Math.round(Number(expForm.amountBRL.replace(',', '.')) * 100);
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          vehicleId: vehicle.id,
          category: expForm.category,
          description: expForm.description,
          amountCents,
          date: expForm.date || data.todayIso,
          status: expForm.status,
        }),
      });
      showToast('Despesa registrada no veículo!');
      setExpModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header with Back Button */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/frota')}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img
            src={getVehicleThumb(vehicle.photoUrl, vehicle.color)}
            alt={vehicle.model}
            className="w-20 h-14 object-contain rounded-2xl bg-slate-50 border border-slate-100 p-1"
          />
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-extrabold text-xs tracking-wider">
                {vehicle.plate}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900">
                {vehicle.brand} {vehicle.model}
              </h2>
              <VehicleStatusBadge status={vehicle.status} />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ano {vehicle.manufacturingYear}/{vehicle.modelYear} • Cor: {vehicle.color || '—'} •
              Odômetro Real: <strong className="text-slate-700">{vehicle.currentKm.toLocaleString('pt-BR')} km</strong>
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Section 10: Visão Geral, Financeiro, Manutenções, Histórico) */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto">
          {[
            { id: 'visao_geral', label: 'Visão Geral', icon: Car },
            { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
            { id: 'manutencoes', label: 'Manutenções', icon: Wrench },
            { id: 'historico', label: 'Histórico', icon: History },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  active ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: VISÃO GERAL */}
      {activeTab === 'visao_geral' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Key Mileage & Status Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-xs font-semibold text-slate-400">Quilometragem Real</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {vehicle.currentKm.toLocaleString('pt-BR')} km
                </p>
                <span className="text-[11px] text-slate-400">
                  Atualizado em {formatBRDate(vehicle.lastKmUpdateDate)}
                </span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-xs font-semibold text-slate-400">Média Diária Ativa</span>
                <p className="text-2xl font-extrabold text-blue-600 mt-1">
                  {vehicle.activeDailyKmAvg !== null ? `${vehicle.activeDailyKmAvg} km/dia` : 'Não informada'}
                </p>
                <span className="text-[11px] text-slate-400">
                  Modo: {vehicle.avgCalculationMode === 'calculated' ? 'Calculada pelo histórico' : 'Manual'}
                </span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-xs font-semibold text-slate-400">Quilometragem Projetada</span>
                <p className="text-2xl font-extrabold text-indigo-600 mt-1">
                  {vehicle.projectedCurrentKm.toLocaleString('pt-BR')} km
                </p>
                <span className="text-[11px] text-slate-400">
                  +{vehicle.daysSinceLastReading} dia(s) desde a última leitura
                </span>
              </div>
            </div>

            {/* Active Customer / Contract Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
              <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Locação Atual
              </h3>
              {vehicle.activeClient && vehicle.activeContract ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
                  <div>
                    <span className="text-xs text-slate-500 block">Cliente Locatário</span>
                    <strong className="text-sm font-extrabold text-slate-900">
                      {vehicle.activeClient.fullName}
                    </strong>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      CPF/CNPJ: {vehicle.activeClient.document}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Período do Contrato</span>
                    <strong className="text-sm font-bold text-slate-800">
                      Início: {formatBRDate(vehicle.activeContract.startDate)}
                    </strong>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Término:{' '}
                      {vehicle.activeContract.isIndefinite
                        ? 'Prazo Indeterminado'
                        : formatBRDate(vehicle.activeContract.endDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Valor & Frequência</span>
                    <strong className="text-sm font-extrabold text-blue-600">
                      {formatCurrencyBRL(vehicle.activeContract.amountCents)}
                    </strong>
                    <span className="block text-xs text-slate-500 capitalize mt-0.5">
                      Cobrança {vehicle.activeContract.frequency}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center">
                  <p className="text-xs font-semibold text-slate-600">
                    Este veículo não possui contrato ativo no momento.
                  </p>
                  <button
                    onClick={() => navigate('/contratos')}
                    className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                  >
                    Criar Contrato de Locação
                  </button>
                </div>
              )}
            </div>

            {/* Technical Specs Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
              <h3 className="text-base font-extrabold text-slate-900 mb-4">Ficha Cadastral do Veículo</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Renavam</span>
                  <strong className="text-slate-800">{vehicle.renavam || 'Não informado'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Chassi</span>
                  <strong className="text-slate-800">{vehicle.chassis || 'Não informado'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Data de Aquisição</span>
                  <strong className="text-slate-800">{formatBRDate(vehicle.acquisitionDate)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Valor de Aquisição</span>
                  <strong className="text-slate-800">
                    {vehicle.acquisitionValueCents
                      ? formatCurrencyBRL(vehicle.acquisitionValueCents)
                      : 'Não informado'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Update Odometer & Daily Average */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs h-fit">
            <h3 className="text-base font-extrabold text-slate-900 mb-1 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-blue-600" />
              Atualizar Quilometragem
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Alterar a quilometragem real ou a média diária recalcula automaticamente todas as previsões de manutenção deste veículo.
            </p>

            <form onSubmit={handleQuickOdometerSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quilometragem Real Atual (km)
                </label>
                <input
                  type="number"
                  placeholder={String(vehicle.currentKm)}
                  value={kmInput}
                  onChange={(e) => setKmInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Média Diária Manual (km/dia)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder={
                    vehicle.manualDailyKmAvg !== null ? String(vehicle.manualDailyKmAvg) : 'Ex: 120'
                  }
                  value={dailyAvgInput}
                  onChange={(e) => setDailyAvgInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-blue-600"
                />
              </div>

              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-slate-700 block">Critério de Média Diária:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={avgModeInput === 'manual'}
                    onChange={() => setAvgModeInput('manual')}
                  />
                  <span>Usar média manual</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={avgModeInput === 'calculated'}
                    onChange={() => setAvgModeInput('calculated')}
                  />
                  <span>
                    Usar média calculada pelo histórico (
                    {vehicle.calculatedDailyKmAvg !== null
                      ? `${vehicle.calculatedDailyKmAvg} km/dia`
                      : 'Indisponível'}
                    )
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
              >
                Salvar e Recalcular Manutenções
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: FINANCEIRO DO VEÍCULO */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">
          {/* 5 Indicators by Vehicle (Section 9) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
              <span className="text-xs text-slate-400 font-semibold">Receita Prevista</span>
              <p className="text-xl font-extrabold text-slate-900 mt-1">
                {formatCurrencyBRL(finMetrics.expectedRevenueCents)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
              <span className="text-xs text-emerald-600 font-semibold">Receita Recebida</span>
              <p className="text-xl font-extrabold text-emerald-600 mt-1">
                {formatCurrencyBRL(finMetrics.receivedRevenueCents)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
              <span className="text-xs text-amber-600 font-semibold">Parcelas Pendentes</span>
              <p className="text-xl font-extrabold text-amber-600 mt-1">
                {formatCurrencyBRL(finMetrics.openRevenueCents)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
              <span className="text-xs text-rose-600 font-semibold">Despesas Realizadas</span>
              <p className="text-xl font-extrabold text-rose-600 mt-1">
                {formatCurrencyBRL(finMetrics.totalExpensesCents)}
              </p>
              <span className="text-[11px] text-slate-400">
                Manutenção: {formatCurrencyBRL(finMetrics.maintenanceExpensesCents)}
              </span>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
              <span className="text-xs text-blue-600 font-semibold">Resultado Operacional</span>
              <p
                className={`text-xl font-extrabold mt-1 ${
                  finMetrics.operationalResultCents >= 0 ? 'text-blue-600' : 'text-rose-600'
                }`}
              >
                {formatCurrencyBRL(finMetrics.operationalResultCents)}
              </p>
              <span className="text-[10px] text-slate-400">Receitas recebidas − Despesas</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Installments of this vehicle */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-extrabold text-slate-900">Parcelas & Recebimentos</h3>
                <button
                  onClick={() => navigate('/financeiro')}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Ir para Financeiro
                </button>
              </div>
              {vehicleInstallments.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Nenhuma parcela vinculada a este veículo.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {vehicleInstallments.map((inst) => {
                    const client = data.clients.find((c) => c.id === inst.clientId);
                    return (
                      <div
                        key={inst.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 border border-slate-100 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-800">
                            Parcela #{inst.installmentNumber} — {client?.fullName || 'Cliente'}
                          </p>
                          <p className="text-slate-400">Vencimento: {formatBRDate(inst.dueDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-extrabold text-slate-900">
                            {formatCurrencyBRL(getInstallmentNetTotalCents(inst))}
                          </p>
                          <InstallmentStatusBadge status={inst.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expenses of this vehicle */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-extrabold text-slate-900">Despesas e Custos do Veículo</h3>
                <button
                  onClick={() => {
                    setExpForm({
                      category: 'Seguro',
                      description: '',
                      amountBRL: '',
                      date: data.todayIso,
                      status: 'paga',
                    });
                    setExpModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Lançar Despesa
                </button>
              </div>
              {vehicleExpenses.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Nenhuma despesa registrada neste veículo.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {vehicleExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 border border-slate-100 text-xs"
                    >
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 font-bold text-[10px] mr-2">
                          {exp.category}
                        </span>
                        <span className="font-bold text-slate-800">{exp.description}</span>
                        <p className="text-slate-400 mt-0.5">{formatBRDate(exp.date)}</p>
                      </div>
                      <strong className="text-rose-600 font-extrabold">
                        {formatCurrencyBRL(exp.amountCents)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MANUTENÇÕES DO VEÍCULO */}
      {activeTab === 'manutencoes' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Plano de Manutenção Preventiva ({vehicle.plate})
                </h3>
                <p className="text-xs text-slate-400">
                  Cálculos automáticos baseados na quilometragem projetada ({vehicle.projectedCurrentKm.toLocaleString('pt-BR')} km) e média diária ({vehicle.activeDailyKmAvg ?? 0} km/dia).
                </p>
              </div>
              <button
                onClick={() => navigate('/manutencoes')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
              >
                Configurar / Registrar Serviço
              </button>
            </div>

            {vehiclePlans.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                Nenhum serviço preventivo cadastrado para este veículo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase">
                      <th className="py-3">Serviço</th>
                      <th className="py-3">Última Execução</th>
                      <th className="py-3">Intervalo Configurado</th>
                      <th className="py-3">Próxima (Km)</th>
                      <th className="py-3">Km Restantes</th>
                      <th className="py-3">Dias Estimados</th>
                      <th className="py-3">Data Prevista</th>
                      <th className="py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vehiclePlans.map((plan) => {
                      const proj = vehicle.projections.find((p) => p.planId === plan.id);
                      return (
                        <tr key={plan.id}>
                          <td className="py-3.5 font-bold text-slate-800">{plan.name}</td>
                          <td className="py-3.5 text-slate-600">
                            {plan.lastMaintenanceKm !== null ? `${plan.lastMaintenanceKm.toLocaleString('pt-BR')} km` : '—'}
                            {plan.lastMaintenanceDate ? ` (${formatBRDate(plan.lastMaintenanceDate)})` : ''}
                          </td>
                          <td className="py-3.5 text-slate-600">
                            {plan.intervalKm ? `${plan.intervalKm.toLocaleString('pt-BR')} km` : ''}
                            {plan.intervalDays ? ` / ${plan.intervalDays} dias` : ''}
                            {plan.intervalMonths ? ` / ${plan.intervalMonths} meses` : ''}
                          </td>
                          <td className="py-3.5 font-bold text-slate-900">
                            {proj?.nextMaintenanceKm !== null && proj?.nextMaintenanceKm !== undefined
                              ? `${proj.nextMaintenanceKm.toLocaleString('pt-BR')} km`
                              : '—'}
                          </td>
                          <td className="py-3.5 font-extrabold text-blue-600">
                            {proj?.remainingKm !== null && proj?.remainingKm !== undefined
                              ? `${proj.remainingKm.toLocaleString('pt-BR')} km`
                              : '—'}
                          </td>
                          <td className="py-3.5 font-semibold text-slate-700">
                            {proj?.effectiveRemainingDays !== null && proj?.effectiveRemainingDays !== undefined
                              ? `${proj.effectiveRemainingDays} dia(s)`
                              : 'Indisponível'}
                          </td>
                          <td className="py-3.5 font-semibold text-slate-800">
                            {proj?.effectiveEstimatedDate
                              ? formatBRDate(proj.effectiveEstimatedDate)
                              : 'Previsão indisponível'}
                          </td>
                          <td className="py-3.5">
                            <MaintenanceStatePill status={proj?.status || 'indisponivel'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Executed Maintenance History */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">
              Histórico de Serviços Realizados
            </h3>
            {vehicleHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhuma manutenção executada registrada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {vehicleHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 gap-2 text-xs"
                  >
                    <div>
                      <span className="font-extrabold text-slate-900 text-sm">{h.serviceName}</span>
                      <p className="text-slate-500 mt-0.5">
                        Realizado em {formatBRDate(h.executionDate)} aos{' '}
                        <strong>{h.executionKm.toLocaleString('pt-BR')} km</strong>
                        {h.provider ? ` • Oficina: ${h.provider}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {formatCurrencyBRL(h.costCents)}
                      </span>
                      <div className="mt-1">
                        <MaintenanceStatePill status="executada" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: HISTÓRICO (Contratos Anteriores, Clientes e Leituras de Odômetro) */}
      {activeTab === 'historico' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">
              Histórico de Contratos e Clientes
            </h3>
            {vehicleContracts.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum contrato registrado para este veículo.
              </p>
            ) : (
              <div className="space-y-3">
                {vehicleContracts.map((c) => {
                  const cli = data.clients.find((cl) => cl.id === c.clientId);
                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 text-sm">{cli?.fullName || 'Cliente'}</strong>
                        <span className="px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] bg-blue-100 text-blue-700">
                          {c.status}
                        </span>
                      </div>
                      <p className="text-slate-500">
                        Período: {formatBRDate(c.startDate)} até{' '}
                        {c.returnDate
                          ? formatBRDate(c.returnDate)
                          : c.isIndefinite
                          ? 'Indeterminado'
                          : formatBRDate(c.endDate)}
                      </p>
                      <p className="text-slate-600">
                        Km Entrega: <strong>{c.deliveryKm.toLocaleString('pt-BR')} km</strong>
                        {c.returnKm !== null
                          ? ` • Km Devolução: ${c.returnKm.toLocaleString('pt-BR')} km`
                          : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">
              Histórico de Leituras de Quilometragem
            </h3>
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {vehicleMileageLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div>
                    <strong className="text-slate-900 font-extrabold">
                      {log.km.toLocaleString('pt-BR')} km
                    </strong>
                    <p className="text-slate-400">{log.notes || log.source}</p>
                  </div>
                  <span className="text-slate-600 font-semibold">{formatBRDate(log.readingDate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Expense Modal */}
      {expModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">
              Nova Despesa • {vehicle.plate}
            </h3>
            <form onSubmit={handleAddVehicleExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
                <select
                  value={expForm.category}
                  onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  {data.settings.expenseCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={expForm.description}
                  onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expForm.amountBRL}
                    onChange={(e) => setExpForm({ ...expForm, amountBRL: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={expForm.date}
                    onChange={(e) => setExpForm({ ...expForm, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setExpModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

