import React, { useState, useMemo } from 'react';
import {
  Wrench,
  Car,
  Plus,
  SlidersHorizontal,
  FileCheck2,
  MoreHorizontal,
  Gauge,
  X,
  Check,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit3,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBRDate, formatCurrencyBRL } from '../../shared/calculations';
import { getVehicleThumb, MaintenanceStatePill } from '../components/UiBadges';
import { MaintenancePlan } from '../../shared/types';

export function MaintenancesPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();

  const [viewMode, setViewMode] = useState<'planos' | 'historico'>('planos');
  const [vehicleFilter, setVehicleFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Floating Right Card / Drawer for Creating or Editing a Maintenance Plan (like Image 1 right card)
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [componentsDropdownOpen, setComponentsDropdownOpen] = useState(false);
  const [customComponentInput, setCustomComponentInput] = useState('');

  // Floating Right Card / Modal for Executing / Completing a Maintenance
  const [executeModalOpen, setExecuteModalOpen] = useState(false);

  const [planForm, setPlanForm] = useState({
    vehicleId: '',
    name: '',
    category: 'Motor',
    components: [] as string[],
    lastMaintenanceKm: '',
    lastMaintenanceDate: '',
    intervalKm: '',
    intervalDays: '',
    intervalMonths: '',
    estimatedCostBRL: '',
    customAlertKmBefore: '',
    customAlertDaysBefore: '',
    notes: '',
  });

  const [execForm, setExecForm] = useState({
    planId: '',
    vehicleId: '',
    serviceName: '',
    category: 'Motor',
    components: [] as string[],
    executionDate: '',
    executionKm: '',
    costBRL: '',
    provider: '',
    notes: '',
    attachmentName: '',
    attachmentData: '',
  });

  if (!data) return null;

  // --- TOP 3 BANNER CARDS CALCULATIONS (Exact match to Image 1 FleetMax) ---
  const totalAssetsCount = data.vehicles.length;
  const totalMaintenancesCount = data.maintenancePlans.length + data.maintenanceHistory.length;
  const totalAccumulatedCostCents = useMemo(() => {
    return data.maintenanceHistory.reduce((acc, h) => acc + (h.costCents || 0), 0);
  }, [data.maintenanceHistory]);

  const enrichedPlans = useMemo(() => {
    return data.maintenancePlans
      .map((plan) => {
        const vehicle = data.vehicles.find((v) => v.id === plan.vehicleId);
        const proj = data.maintenanceProjections.find((p) => p.planId === plan.id);
        return { plan, vehicle, proj };
      })
      .filter((item) => {
        if (!item.vehicle) return false;
        if (vehicleFilter !== 'todos' && item.vehicle.id !== vehicleFilter) return false;
        if (statusFilter !== 'todos' && item.proj?.status !== statusFilter) return false;
        return true;
      });
  }, [data.maintenancePlans, data.vehicles, data.maintenanceProjections, vehicleFilter, statusFilter]);

  const filteredHistory = useMemo(() => {
    return data.maintenanceHistory.filter((h) => {
      if (vehicleFilter !== 'todos' && h.vehicleId !== vehicleFilter) return false;
      return true;
    });
  }, [data.maintenanceHistory, vehicleFilter]);

  const openNewPlanDrawer = () => {
    const firstVehicle = data.vehicles[0];
    setEditingPlan(null);
    setPlanForm({
      vehicleId: firstVehicle ? firstVehicle.id : '',
      name: '',
      category: 'Motor',
      components: [],
      lastMaintenanceKm: firstVehicle ? String(firstVehicle.currentKm) : '',
      lastMaintenanceDate: data.todayIso,
      intervalKm: '', // Empty by default — never imposes mandatory intervals!
      intervalDays: '',
      intervalMonths: '',
      estimatedCostBRL: '',
      customAlertKmBefore: '',
      customAlertDaysBefore: '',
      notes: '',
    });
    setPlanDrawerOpen(true);
  };

  const openEditPlanDrawer = (plan: MaintenancePlan) => {
    setEditingPlan(plan);
    setPlanForm({
      vehicleId: plan.vehicleId,
      name: plan.name,
      category: plan.category,
      components: [...(plan.components || [])],
      lastMaintenanceKm: plan.lastMaintenanceKm !== null ? String(plan.lastMaintenanceKm) : '',
      lastMaintenanceDate: plan.lastMaintenanceDate || '',
      intervalKm: plan.intervalKm !== null ? String(plan.intervalKm) : '',
      intervalDays: plan.intervalDays !== null ? String(plan.intervalDays) : '',
      intervalMonths: plan.intervalMonths !== null ? String(plan.intervalMonths) : '',
      estimatedCostBRL:
        plan.estimatedCostCents !== null ? (plan.estimatedCostCents / 100).toFixed(2) : '',
      customAlertKmBefore: plan.customAlertKmBefore !== null ? String(plan.customAlertKmBefore) : '',
      customAlertDaysBefore: plan.customAlertDaysBefore !== null ? String(plan.customAlertDaysBefore) : '',
      notes: plan.notes || '',
    });
    setPlanDrawerOpen(true);
  };

  const openExecuteFromPlan = (plan: MaintenancePlan) => {
    const vehicle = data.vehicles.find((v) => v.id === plan.vehicleId);
    setExecForm({
      planId: plan.id,
      vehicleId: plan.vehicleId,
      serviceName: plan.name,
      category: plan.category,
      components: [...(plan.components || [])],
      executionDate: data.todayIso,
      executionKm: vehicle ? String(vehicle.currentKm) : '',
      costBRL: plan.estimatedCostCents !== null ? (plan.estimatedCostCents / 100).toFixed(2) : '',
      provider: '',
      notes: '',
      attachmentName: '',
      attachmentData: '',
    });
    setExecuteModalOpen(true);
  };

  const toggleComponentInPlan = (comp: string) => {
    setPlanForm((prev) => {
      const exists = prev.components.includes(comp);
      const next = exists ? prev.components.filter((c) => c !== comp) : [...prev.components, comp];
      return {
        ...prev,
        components: next,
        name: prev.name.trim() === '' && next.length === 1 ? next[0] : prev.name,
      };
    });
  };

  const addCustomComponent = () => {
    const trimmed = customComponentInput.trim();
    if (!trimmed) return;
    if (!planForm.components.includes(trimmed)) {
      setPlanForm((prev) => ({
        ...prev,
        components: [...prev.components, trimmed],
        name: prev.name.trim() === '' ? trimmed : prev.name,
      }));
    }
    setCustomComponentInput('');
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        vehicleId: planForm.vehicleId,
        name: planForm.name,
        category: planForm.category,
        components: planForm.components,
        lastMaintenanceKm: planForm.lastMaintenanceKm !== '' ? Number(planForm.lastMaintenanceKm) : null,
        lastMaintenanceDate: planForm.lastMaintenanceDate || null,
        intervalKm: planForm.intervalKm !== '' ? Number(planForm.intervalKm) : null,
        intervalDays: planForm.intervalDays !== '' ? Number(planForm.intervalDays) : null,
        intervalMonths: planForm.intervalMonths !== '' ? Number(planForm.intervalMonths) : null,
        estimatedCostCents:
          planForm.estimatedCostBRL !== ''
            ? Math.round(Number(planForm.estimatedCostBRL.replace(',', '.')) * 100)
            : null,
        customAlertKmBefore:
          planForm.customAlertKmBefore !== '' ? Number(planForm.customAlertKmBefore) : null,
        customAlertDaysBefore:
          planForm.customAlertDaysBefore !== '' ? Number(planForm.customAlertDaysBefore) : null,
        notes: planForm.notes,
      };

      if (editingPlan) {
        await apiFetch(`/api/maintenance-plans/${editingPlan.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Plano de manutenção atualizado e recalculado!');
      } else {
        await apiFetch('/api/maintenance-plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Plano de manutenção criado!');
      }
      setPlanDrawerOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveExecution = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const costCents =
        execForm.costBRL !== '' ? Math.round(Number(execForm.costBRL.replace(',', '.')) * 100) : 0;

      await apiFetch('/api/maintenance-history', {
        method: 'POST',
        body: JSON.stringify({
          planId: execForm.planId || null,
          vehicleId: execForm.vehicleId,
          serviceName: execForm.serviceName,
          category: execForm.category,
          components: execForm.components,
          executionDate: execForm.executionDate,
          executionKm: Number(execForm.executionKm),
          costCents,
          provider: execForm.provider,
          notes: execForm.notes,
          attachmentName: execForm.attachmentName,
          attachmentData: execForm.attachmentData,
        }),
      });
      showToast('Manutenção registrada! Odômetro, despesa e próxima previsão foram atualizados.');
      setExecuteModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePlan = async (plan: MaintenancePlan) => {
    if (!window.confirm(`Deseja excluir o plano "${plan.name}"?`)) return;
    try {
      await apiFetch(`/api/maintenance-plans/${plan.id}`, { method: 'DELETE' });
      showToast('Plano removido.', 'info');
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExecForm((prev) => ({
        ...prev,
        attachmentName: file.name,
        attachmentData: typeof reader.result === 'string' ? reader.result : '',
      }));
    };
    reader.readAsDataURL(file);
  };

  const selectedVehicleInDrawer = data.vehicles.find((v) => v.id === planForm.vehicleId);

  return (
    <div className="space-y-6 relative">
      {/* Header Bar (Exact match to Image 1 "Maintenances" + Right Action Icons) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Manutenções</h2>
          <p className="text-xs text-slate-400">
            Todos os valores exibidos em Reais (R$). Intervalos configurados manualmente por veículo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              const firstVehicle = data.vehicles[0];
              setExecForm({
                planId: '',
                vehicleId: firstVehicle ? firstVehicle.id : '',
                serviceName: '',
                category: 'Manutenção',
                components: [],
                executionDate: data.todayIso,
                executionKm: firstVehicle ? String(firstVehicle.currentKm) : '',
                costBRL: '',
                provider: '',
                notes: '',
                attachmentName: '',
                attachmentData: '',
              });
              setExecuteModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-600 text-xs font-bold shadow-2xs transition"
            title="Registrar serviço já executado"
          >
            <FileCheck2 className="w-4 h-4 text-teal-600" />
            <span>Dar Baixa / Registrar Executada</span>
          </button>

          <button
            onClick={openNewPlanDrawer}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#14b8a6] hover:bg-[#0d9488] text-white text-xs font-bold shadow-md shadow-teal-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Plano Preventivo</span>
          </button>
        </div>
      </div>

      {/* 3 Top Gradient Banner Cards (Exact match to Image 1 FleetMax) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: NUMBER OF ASSETS / VEÍCULOS */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-90 block">
              QUANTIDADE DE VEÍCULOS
            </span>
            <span className="text-3xl font-extrabold mt-1 block">{totalAssetsCount}</span>
          </div>
          <Car className="w-8 h-8 opacity-85" />
        </div>

        {/* Card 2: NUMBER OF MAINTENANCES */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-[#06b6d4] to-[#0284c7] text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-90 block">
              PLANOS & REGISTROS DE MANUTENÇÃO
            </span>
            <span className="text-3xl font-extrabold mt-1 block">{totalMaintenancesCount}</span>
          </div>
          <Wrench className="w-8 h-8 opacity-85" />
        </div>

        {/* Card 3: TOTAL ACCUMULATED COST */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-90 block">
              CUSTO TOTAL ACUMULADO
            </span>
            <span className="text-3xl font-extrabold mt-1 block">
              {formatCurrencyBRL(totalAccumulatedCostCents)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-extrabold text-sm">
            R$
          </div>
        </div>
      </div>

      {/* Filters & View Switcher */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('planos')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              viewMode === 'planos'
                ? 'bg-[#0284c7] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Planos & Previsões ({data.maintenancePlans.length})
          </button>
          <button
            onClick={() => setViewMode('historico')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              viewMode === 'historico'
                ? 'bg-[#14b8a6] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Histórico Executado ({data.maintenanceHistory.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="todos">Todos os veículos</option>
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.brand} {v.model}
              </option>
            ))}
          </select>

          {viewMode === 'planos' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="todos">Todos os status</option>
              <option value="em_dia">Em dia</option>
              <option value="proxima">Próxima do vencimento</option>
              <option value="vencida">Vencida</option>
              <option value="indisponivel">Previsão indisponível</option>
            </select>
          )}
        </div>
      </div>

      {/* Main FleetMax-Inspired Table */}
      {viewMode === 'planos' ? (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
          {enrichedPlans.length === 0 ? (
            <div className="p-12 text-center">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">
                Nenhum plano de manutenção preventiva configurado
              </h3>
              <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1 mb-5">
                Configure livremente serviços como Troca de Óleo, Filtros, Pastilhas de Freio, Pneus ou Correia para cada veículo, definindo o intervalo em quilômetros ou dias.
              </p>
              <button
                onClick={openNewPlanDrawer}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#14b8a6] hover:bg-[#0d9488] text-white text-xs font-bold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Criar Primeiro Plano de Manutenção
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                    <th className="py-3.5 pl-5">Imagem</th>
                    <th className="py-3.5">Placa</th>
                    <th className="py-3.5">Tipo / Serviço</th>
                    <th className="py-3.5">Status</th>
                    <th className="py-3.5">Custo Est.</th>
                    <th className="py-3.5">Próx. Odômetro</th>
                    <th className="py-3.5">Km / Dias Restantes</th>
                    <th className="py-3.5">Data Prevista</th>
                    <th className="py-3.5">Componentes / Peças</th>
                    <th className="py-3.5 text-right pr-5">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {enrichedPlans.map(({ plan, vehicle, proj }) => {
                    if (!vehicle) return null;
                    return (
                      <tr key={plan.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 pl-5">
                          <img
                            src={getVehicleThumb(vehicle.photoUrl, vehicle.color)}
                            alt={vehicle.model}
                            className="w-16 h-10 object-contain rounded-lg bg-slate-50 border border-slate-100"
                          />
                        </td>
                        <td className="py-3.5">
                          <span className="font-extrabold text-sm text-slate-900 tracking-wide block">
                            {vehicle.plate}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <Wrench className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{plan.name}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 block pl-5">{plan.category}</span>
                        </td>
                        <td className="py-3.5">
                          <MaintenanceStatePill status={proj?.status || 'indisponivel'} />
                        </td>
                        <td className="py-3.5 font-extrabold text-slate-800">
                          {plan.estimatedCostCents !== null
                            ? formatCurrencyBRL(plan.estimatedCostCents)
                            : '—'}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <Gauge className="w-4 h-4 text-[#0284c7]" />
                            <span>
                              {proj?.nextMaintenanceKm !== null && proj?.nextMaintenanceKm !== undefined
                                ? `${proj.nextMaintenanceKm.toLocaleString('pt-BR')} kms`
                                : '—'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Última:{' '}
                            {plan.lastMaintenanceKm !== null
                              ? `${plan.lastMaintenanceKm.toLocaleString('pt-BR')} km`
                              : '—'}{' '}
                            (+{plan.intervalKm ? `${plan.intervalKm.toLocaleString('pt-BR')} km` : '—'})
                          </span>
                        </td>
                        <td className="py-3.5">
                          {proj?.remainingKm !== null && proj?.remainingKm !== undefined ? (
                            <div>
                              <span
                                className={`font-extrabold ${
                                  proj.remainingKm <= 0
                                    ? 'text-rose-600'
                                    : proj.status === 'proxima'
                                    ? 'text-amber-600'
                                    : 'text-slate-800'
                                }`}
                              >
                                {proj.remainingKm.toLocaleString('pt-BR')} km
                              </span>
                              <span className="block text-[11px] text-slate-400">
                                {proj.effectiveRemainingDays !== null
                                  ? `${proj.effectiveRemainingDays} dia(s) (${proj.activeDailyKmAvg ?? 0} km/dia)`
                                  : 'Média diária não informada'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5">
                          {proj?.effectiveEstimatedDate ? (
                            <span className="font-semibold text-slate-800">
                              {formatBRDate(proj.effectiveEstimatedDate)}
                            </span>
                          ) : (
                            <div>
                              <span className="text-amber-700 font-semibold block">
                                Previsão indisponível
                              </span>
                              {proj?.missingDataReasons?.[0] && (
                                <span className="text-[10px] text-slate-400 block max-w-[170px]">
                                  {proj.missingDataReasons[0]}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(plan.components || []).length === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              plan.components.map((c) => (
                                <span
                                  key={c}
                                  className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 text-[10px] font-semibold"
                                >
                                  {c}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 text-right pr-5">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => openExecuteFromPlan(plan)}
                              className="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold text-[11px] transition"
                              title="Registrar que esta manutenção foi realizada"
                            >
                              Concluir
                            </button>
                            <button
                              onClick={() => openEditPlanDrawer(plan)}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                              title="Editar intervalo ou dados"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePlan(plan)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Excluir plano"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Executed Maintenance History Table */
        <div className="bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Nenhuma manutenção realizada foi registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                    <th className="py-3.5 pl-5">Veículo</th>
                    <th className="py-3.5">Serviço Executado</th>
                    <th className="py-3.5">Status</th>
                    <th className="py-3.5">Custo Real</th>
                    <th className="py-3.5">Quilometragem Real</th>
                    <th className="py-3.5">Data da Execução</th>
                    <th className="py-3.5">Componentes / Oficina</th>
                    <th className="py-3.5 pr-5">Comprovante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredHistory.map((h) => {
                    const v = data.vehicles.find((veh) => veh.id === h.vehicleId);
                    return (
                      <tr key={h.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 pl-5 font-extrabold text-slate-900">
                          {v ? `${v.plate} (${v.model})` : 'Veículo'}
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">{h.serviceName}</td>
                        <td className="py-3.5">
                          <MaintenanceStatePill status="executada" />
                        </td>
                        <td className="py-3.5 font-extrabold text-slate-900">
                          {formatCurrencyBRL(h.costCents)}
                        </td>
                        <td className="py-3.5 font-semibold text-slate-700">
                          {h.executionKm.toLocaleString('pt-BR')} kms
                        </td>
                        <td className="py-3.5 text-slate-600">{formatBRDate(h.executionDate)}</td>
                        <td className="py-3.5 text-slate-600">
                          {(h.components || []).join(', ') || '—'}
                          {h.provider ? ` • Oficina: ${h.provider}` : ''}
                        </td>
                        <td className="py-3.5 pr-5">
                          {h.attachmentName ? (
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold text-[11px]">
                              {h.attachmentName}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Floating Right Drawer / Card for Maintenance Plan (Inspired by Image 1 right floating card + multi-select popover) */}
      {planDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px] p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 my-auto max-h-[94vh] overflow-y-auto relative">
            {/* Top Vehicle Mini Header (Exact match to Image 1: X button + Car Thumbnail + Plate + Model) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <button
                onClick={() => setPlanDrawerOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>

              {selectedVehicleInDrawer ? (
                <div className="flex items-center gap-3">
                  <img
                    src={getVehicleThumb(selectedVehicleInDrawer.photoUrl, selectedVehicleInDrawer.color)}
                    alt={selectedVehicleInDrawer.model}
                    className="w-12 h-8 object-contain"
                  />
                  <div className="text-left">
                    <p className="text-xs font-extrabold text-slate-900 leading-none">
                      {selectedVehicleInDrawer.plate}
                    </p>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">
                      {selectedVehicleInDrawer.brand} {selectedVehicleInDrawer.model}
                    </p>
                  </div>
                </div>
              ) : (
                <span className="text-xs font-bold text-slate-400">Selecione um veículo</span>
              )}
              <div className="w-6" />
            </div>

            <h3 className="text-center text-lg font-extrabold text-slate-800 my-4">
              {editingPlan ? 'Editar Manutenção' : 'Plano de Manutenção'}
            </h3>

            <form onSubmit={handleSavePlan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Veículo Relacionado *</label>
                <select
                  required
                  value={planForm.vehicleId}
                  onChange={(e) => {
                    const v = data.vehicles.find((veh) => veh.id === e.target.value);
                    setPlanForm({
                      ...planForm,
                      vehicleId: e.target.value,
                      lastMaintenanceKm: v ? String(v.currentKm) : planForm.lastMaintenanceKm,
                    });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  <option value="">Selecione um veículo...</option>
                  {data.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.brand} {v.model} ({v.currentKm} km)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome / Descrição da Manutenção *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Troca de óleo do motor, Pastilhas de freio..."
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo / Categoria *</label>
                <select
                  value={planForm.category}
                  onChange={(e) => setPlanForm({ ...planForm, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  {data.settings.maintenanceCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-Select Components / Parts Tag Selector (Exact match to Image 1 "Components/Parts") */}
              <div className="relative">
                <label className="block font-bold text-slate-700 mb-1">Componentes / Peças</label>
                <div
                  onClick={() => setComponentsDropdownOpen(!componentsDropdownOpen)}
                  className="min-h-[42px] w-full px-3 py-1.5 rounded-xl border border-teal-500/70 bg-white flex flex-wrap items-center justify-between gap-1.5 cursor-pointer"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {planForm.components.length === 0 && (
                      <span className="text-slate-400 py-1">Selecionar serviços ou peças...</span>
                    )}
                    {planForm.components.map((comp) => (
                      <span
                        key={comp}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleComponentInPlan(comp);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 text-[#0284c7] border border-cyan-200 font-bold text-[11px]"
                      >
                        {comp}
                        <X className="w-3 h-3" />
                      </span>
                    ))}
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </div>

                {componentsDropdownOpen && (
                  <div className="mt-1 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl space-y-1 max-h-52 overflow-y-auto z-30">
                    {data.settings.commonComponents.map((comp) => {
                      const checked = planForm.components.includes(comp);
                      return (
                        <div
                          key={comp}
                          onClick={() => toggleComponentInPlan(comp)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition ${
                            checked ? 'bg-teal-50/80 text-slate-900 font-bold' : 'hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center ${
                              checked ? 'bg-[#0284c7] text-white' : 'border border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </div>
                          <span>{comp}</span>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-slate-100 flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Adicionar outro item..."
                        value={customComponentInput}
                        onChange={(e) => setCustomComponentInput(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addCustomComponent}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Last Execution & Configurable Intervals */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Km da Última Manutenção</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 42000"
                    value={planForm.lastMaintenanceKm}
                    onChange={(e) => setPlanForm({ ...planForm, lastMaintenanceKm: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data da Última</label>
                  <input
                    type="date"
                    value={planForm.lastMaintenanceDate}
                    onChange={(e) => setPlanForm({ ...planForm, lastMaintenanceDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2.5">
                <p className="font-extrabold text-slate-700">
                  Intervalo para Próxima Manutenção (Configurável)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      A cada (Km)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 8000"
                      value={planForm.intervalKm}
                      onChange={(e) => setPlanForm({ ...planForm, intervalKm: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-[#0284c7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Ou Dias (opc.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 180"
                      value={planForm.intervalDays}
                      onChange={(e) => setPlanForm({ ...planForm, intervalDays: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Ou Meses (opc.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 6"
                      value={planForm.intervalMonths}
                      onChange={(e) => setPlanForm({ ...planForm, intervalMonths: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Alert Thresholds */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Avisar X km antes (opc.)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 1000"
                    value={planForm.customAlertKmBefore}
                    onChange={(e) => setPlanForm({ ...planForm, customAlertKmBefore: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Avisar X dias antes (opc.)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 15"
                    value={planForm.customAlertDaysBefore}
                    onChange={(e) => setPlanForm({ ...planForm, customAlertDaysBefore: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Cost Field with Currency Pill (Exact match to Image 1 bottom field) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Custo Estimado</label>
                <div className="flex items-center rounded-full border border-slate-200 overflow-hidden bg-slate-50/60">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={planForm.estimatedCostBRL}
                    onChange={(e) => setPlanForm({ ...planForm, estimatedCostBRL: e.target.value })}
                    className="flex-1 px-4 py-2.5 bg-transparent text-right font-bold text-slate-800 focus:outline-none"
                  />
                  <span className="px-4 py-2.5 bg-[#0284c7] text-white font-extrabold text-xs">
                    R$
                  </span>
                </div>
              </div>

              <div className="pt-3 flex justify-center">
                <button
                  type="submit"
                  className="px-10 py-3 rounded-full bg-[#14b8a6] hover:bg-[#0d9488] text-white font-extrabold text-xs shadow-lg shadow-teal-500/25 transition"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Registering Executed Maintenance (Section 4 History) */}
      {executeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Registrar Manutenção Realizada
                </h3>
                <p className="text-xs text-slate-400">
                  Atualiza o histórico, recalcula a próxima previsão e lança automaticamente nas despesas do veículo.
                </p>
              </div>
              <button
                onClick={() => setExecuteModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExecution} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Veículo *</label>
                  <select
                    required
                    value={execForm.vehicleId}
                    onChange={(e) => {
                      const v = data.vehicles.find((veh) => veh.id === e.target.value);
                      setExecForm({
                        ...execForm,
                        vehicleId: e.target.value,
                        executionKm: v ? String(v.currentKm) : execForm.executionKm,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="">Selecione...</option>
                    {data.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} — {v.model}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Serviço Executado *</label>
                  <input
                    type="text"
                    required
                    value={execForm.serviceName}
                    onChange={(e) => setExecForm({ ...execForm, serviceName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data Real *</label>
                  <input
                    type="date"
                    required
                    value={execForm.executionDate}
                    onChange={(e) => setExecForm({ ...execForm, executionDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quilometragem Real *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={execForm.executionKm}
                    onChange={(e) => setExecForm({ ...execForm, executionKm: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-extrabold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Custo Real (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0,00"
                    value={execForm.costBRL}
                    onChange={(e) => setExecForm({ ...execForm, costBRL: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-extrabold text-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Oficina / Prestador</label>
                  <input
                    type="text"
                    placeholder="Nome da oficina ou mecânico"
                    value={execForm.provider}
                    onChange={(e) => setExecForm({ ...execForm, provider: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Comprovante / NF (opc.)</label>
                  <label className="w-full px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center gap-1.5 cursor-pointer font-semibold text-slate-600">
                    <Upload className="w-3.5 h-3.5" />
                    <span className="truncate">{execForm.attachmentName || 'Anexar Nota Fiscal'}</span>
                    <input type="file" onChange={handleAttachmentUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações</label>
                <input
                  type="text"
                  value={execForm.notes}
                  onChange={(e) => setExecForm({ ...execForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExecuteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-[#14b8a6] hover:bg-[#0d9488] text-white font-bold shadow-sm"
                >
                  Confirmar e Recalcular Próxima
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

