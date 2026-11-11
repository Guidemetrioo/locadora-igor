import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Car,
  Plus,
  Search,
  Gauge,
  Edit3,
  Trash2,
  Eye,
  X,
  Upload,
  Check,
  Calendar,
} from 'lucide-react';
import { useApp, EnrichedVehicle } from '../context/AppContext';
import { formatBRDate, formatCurrencyBRL } from '../../shared/calculations';
import { getVehicleThumb, VehicleStatusBadge } from '../components/UiBadges';

export function FleetPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Create / Edit Vehicle Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<EnrichedVehicle | null>(null);

  // Quick Odometer Update Modal
  const [mileageModalVehicle, setMileageModalVehicle] = useState<EnrichedVehicle | null>(null);
  const [newKm, setNewKm] = useState('');
  const [newKmDate, setNewKmDate] = useState('');
  const [newDailyAvg, setNewDailyAvg] = useState('');
  const [newAvgMode, setNewAvgMode] = useState<'manual' | 'calculated'>('manual');
  const [mileageNotes, setMileageNotes] = useState('');

  // Form states for Vehicle Modal
  const [form, setForm] = useState({
    brand: '',
    model: '',
    manufacturingYear: new Date().getFullYear(),
    modelYear: new Date().getFullYear(),
    plate: '',
    color: 'Branco',
    renavam: '',
    chassis: '',
    photoUrl: '',
    acquisitionDate: '',
    acquisitionValueBRL: '',
    status: 'disponivel',
    currentKm: 0,
    lastKmUpdateDate: '',
    manualDailyKmAvg: '',
    avgCalculationMode: 'manual' as 'manual' | 'calculated',
    notes: '',
  });

  if (!data) return null;

  const filteredVehicles = useMemo(() => {
    return data.vehicles.filter((v) => {
      if (statusFilter !== 'todos' && v.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          v.plate.toLowerCase().includes(q) ||
          v.brand.toLowerCase().includes(q) ||
          v.model.toLowerCase().includes(q) ||
          (v.color || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data.vehicles, statusFilter, search]);

  const openCreateModal = () => {
    setEditingVehicle(null);
    setForm({
      brand: '',
      model: '',
      manufacturingYear: new Date().getFullYear(),
      modelYear: new Date().getFullYear(),
      plate: '',
      color: 'Branco',
      renavam: '',
      chassis: '',
      photoUrl: '',
      acquisitionDate: '',
      acquisitionValueBRL: '',
      status: 'disponivel',
      currentKm: 0,
      lastKmUpdateDate: data.todayIso,
      manualDailyKmAvg: '',
      avgCalculationMode: 'manual',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (v: EnrichedVehicle) => {
    setEditingVehicle(v);
    setForm({
      brand: v.brand,
      model: v.model,
      manufacturingYear: v.manufacturingYear,
      modelYear: v.modelYear,
      plate: v.plate,
      color: v.color || 'Branco',
      renavam: v.renavam || '',
      chassis: v.chassis || '',
      photoUrl: v.photoUrl || '',
      acquisitionDate: v.acquisitionDate || '',
      acquisitionValueBRL:
        v.acquisitionValueCents !== undefined ? (v.acquisitionValueCents / 100).toFixed(2) : '',
      status: v.status,
      currentKm: v.currentKm,
      lastKmUpdateDate: v.lastKmUpdateDate || data.todayIso,
      manualDailyKmAvg: v.manualDailyKmAvg !== null ? String(v.manualDailyKmAvg) : '',
      avgCalculationMode: v.avgCalculationMode,
      notes: v.notes || '',
    });
    setModalOpen(true);
  };

  const openMileageModal = (v: EnrichedVehicle) => {
    setMileageModalVehicle(v);
    setNewKm(String(v.currentKm));
    setNewKmDate(data.todayIso);
    setNewDailyAvg(v.manualDailyKmAvg !== null ? String(v.manualDailyKmAvg) : '');
    setNewAvgMode(v.avgCalculationMode);
    setMileageNotes('');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, photoUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        acquisitionValueCents:
          form.acquisitionValueBRL.trim() !== ''
            ? Math.round(Number(form.acquisitionValueBRL.replace(',', '.')) * 100)
            : null,
        manualDailyKmAvg:
          form.manualDailyKmAvg.trim() !== '' ? Number(form.manualDailyKmAvg.replace(',', '.')) : null,
      };

      if (editingVehicle) {
        await apiFetch(`/api/vehicles/${editingVehicle.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Veículo atualizado e previsões recalculadas!');
      } else {
        await apiFetch('/api/vehicles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Veículo cadastrado com sucesso!');
      }
      setModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveMileage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mileageModalVehicle) return;
    try {
      await apiFetch(`/api/vehicles/${mileageModalVehicle.id}/mileage`, {
        method: 'POST',
        body: JSON.stringify({
          km: Number(newKm),
          readingDate: newKmDate,
          manualDailyKmAvg: newDailyAvg.trim() !== '' ? Number(newDailyAvg.replace(',', '.')) : null,
          avgCalculationMode: newAvgMode,
          notes: mileageNotes,
        }),
      });
      showToast('Quilometragem e média diária atualizadas!');
      setMileageModalVehicle(null);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteVehicle = async (v: EnrichedVehicle) => {
    if (!window.confirm(`Deseja realmente remover o veículo ${v.brand} ${v.model} (${v.plate})?`)) {
      return;
    }
    try {
      await apiFetch(`/api/vehicles/${v.id}`, { method: 'DELETE' });
      showToast('Veículo removido da frota ativa.', 'info');
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xs border border-slate-100">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Minha Frota</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie seus veículos, atualize leituras reais de odômetro e configure a média diária de rodagem.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition"
        >
          <Plus className="w-4 h-4" />
          Adicionar Veículo
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por placa, marca, modelo ou cor..."
            className="w-full pl-11 pr-4 py-2.5 bg-white rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'disponivel', label: 'Disponíveis' },
            { id: 'alugado', label: 'Alugados' },
            { id: 'manutencao', label: 'Em Manutenção' },
            { id: 'inativo', label: 'Inativos' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fleet Grid / Cards */}
      {filteredVehicles.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-200">
          <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Nenhum veículo encontrado</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
            Cadastre os veículos da sua locadora sem limitações fixas e configure a quilometragem real e média diária de cada um.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Veículo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredVehicles.map((v) => {
            const overdueMaintCount = v.projections.filter((p) => p.status === 'vencida').length;
            const nearMaintCount = v.projections.filter((p) => p.status === 'proxima').length;

            return (
              <div
                key={v.id}
                className="bg-white rounded-3xl border border-slate-100 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Card Top Image & Status */}
                  <div
                    onClick={() => navigate(`/frota/${v.id}`)}
                    className="relative h-44 bg-gradient-to-b from-slate-50 to-slate-100/60 flex items-center justify-center p-4 cursor-pointer"
                  >
                    <img
                      src={getVehicleThumb(v.photoUrl, v.color)}
                      alt={v.model}
                      className="max-h-36 w-auto object-contain rounded-xl transition-transform hover:scale-105"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="px-3 py-1 rounded-lg bg-slate-900/90 text-white font-extrabold text-xs tracking-wider shadow-xs">
                        {v.plate}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <VehicleStatusBadge status={v.status} />
                    </div>
                  </div>

                  {/* Vehicle Info */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        onClick={() => navigate(`/frota/${v.id}`)}
                        className="cursor-pointer group"
                      >
                        <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition">
                          {v.brand} {v.model}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Ano {v.manufacturingYear}/{v.modelYear} • Cor: {v.color || '—'}
                        </p>
                      </div>
                      {(overdueMaintCount > 0 || nearMaintCount > 0) && (
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            overdueMaintCount > 0
                              ? 'bg-rose-50 text-rose-600 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {overdueMaintCount > 0
                            ? `${overdueMaintCount} manut. vencida`
                            : `${nearMaintCount} manut. próxima`}
                        </span>
                      )}
                    </div>

                    {/* Odometer & Daily Average Box */}
                    <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Quilometragem Real:</span>
                        <strong className="text-slate-900 font-extrabold">
                          {v.currentKm.toLocaleString('pt-BR')} km
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Última leitura:</span>
                        <span className="text-slate-700 font-semibold">
                          {formatBRDate(v.lastKmUpdateDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">
                          Média Diária ({v.avgCalculationMode === 'calculated' ? 'Calculada' : 'Manual'}):
                        </span>
                        <strong className="text-blue-600 font-bold">
                          {v.activeDailyKmAvg !== null ? `${v.activeDailyKmAvg} km/dia` : 'Não configurada'}
                        </strong>
                      </div>
                      {v.projectedCurrentKm > v.currentKm && (
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70">
                          <span className="text-slate-500">Km Projetado Hoje:</span>
                          <span className="font-bold text-indigo-600">
                            ~{v.projectedCurrentKm.toLocaleString('pt-BR')} km
                          </span>
                        </div>
                      )}
                    </div>

                    {v.activeClient && (
                      <div className="mt-3 px-3 py-2 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center justify-between text-xs">
                        <span className="text-blue-600 font-medium">Locatário atual:</span>
                        <strong className="text-blue-900 truncate ml-2">{v.activeClient.fullName}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => navigate(`/frota/${v.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    <Eye className="w-4 h-4" />
                    Abrir Detalhes
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openMileageModal(v)}
                      className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 text-xs font-semibold flex items-center gap-1 transition"
                      title="Atualizar Quilometragem e Média Diária"
                    >
                      <Gauge className="w-3.5 h-3.5" />
                      Km
                    </button>
                    <button
                      onClick={() => openEditModal(v)}
                      className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-600 transition"
                      title="Editar Veículo"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteVehicle(v)}
                      className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 transition"
                      title="Excluir Veículo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create / Edit Vehicle */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingVehicle ? `Editar Veículo (${editingVehicle.plate})` : 'Cadastrar Novo Veículo'}
                </h3>
                <p className="text-xs text-slate-400">
                  Nenhum intervalo ou média é imposto automaticamente — configure como preferir.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Marca *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Renault, Fiat, VW"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Modelo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Kwid, Mobi, Gol"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Placa *</label>
                  <input
                    type="text"
                    required
                    placeholder="ABC-1D23"
                    value={form.plate}
                    onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm uppercase font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Ano Fabricação</label>
                  <input
                    type="number"
                    value={form.manufacturingYear}
                    onChange={(e) => setForm({ ...form, manufacturingYear: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Ano Modelo</label>
                  <input
                    type="number"
                    value={form.modelYear}
                    onChange={(e) => setForm({ ...form, modelYear: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Cor</label>
                  <input
                    type="text"
                    placeholder="Branco, Prata, Preto..."
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="disponivel">Disponível</option>
                    <option value="alugado">Alugado</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              {/* Mileage & Daily Average Section */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-700">
                  Controle de Quilometragem e Média Diária
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Quilometragem Real Atual (km) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={form.currentKm}
                      onChange={(e) => setForm({ ...form, currentKm: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Data da Leitura
                    </label>
                    <input
                      type="date"
                      value={form.lastKmUpdateDate}
                      onChange={(e) => setForm({ ...form, lastKmUpdateDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Média Diária Estimada (km/dia)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 100 ou 120"
                      value={form.manualDailyKmAvg}
                      onChange={(e) => setForm({ ...form, manualDailyKmAvg: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-blue-600"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                  <span className="font-semibold text-slate-600">Modo de cálculo da média:</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="avgMode"
                      checked={form.avgCalculationMode === 'manual'}
                      onChange={() => setForm({ ...form, avgCalculationMode: 'manual' })}
                    />
                    <span>Utilizar média informada manualmente</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="avgMode"
                      checked={form.avgCalculationMode === 'calculated'}
                      onChange={() => setForm({ ...form, avgCalculationMode: 'calculated' })}
                    />
                    <span>Calcular automaticamente pelo histórico de leituras</span>
                  </label>
                </div>
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Renavam (opcional)</label>
                  <input
                    type="text"
                    value={form.renavam}
                    onChange={(e) => setForm({ ...form, renavam: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Chassi (opcional)</label>
                  <input
                    type="text"
                    value={form.chassis}
                    onChange={(e) => setForm({ ...form, chassis: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Data Aquisição (opc.)</label>
                  <input
                    type="date"
                    value={form.acquisitionDate}
                    onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Valor Aquisição R$ (opc.)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.acquisitionValueBRL}
                    onChange={(e) => setForm({ ...form, acquisitionValueBRL: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              {/* Photo URL or File Upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Foto do Veículo (Upload ou URL opcional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Cole a URL da imagem ou envie um arquivo ao lado..."
                    value={form.photoUrl}
                    onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                  <label className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    Enviar Foto
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20"
                >
                  {editingVehicle ? 'Salvar Alterações' : 'Cadastrar Veículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Quick Odometer & Daily Average Update */}
      {mileageModalVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Atualizar Quilometragem • {mileageModalVehicle.plate}
                </h3>
                <p className="text-xs text-slate-400">
                  {mileageModalVehicle.brand} {mileageModalVehicle.model}
                </p>
              </div>
              <button
                onClick={() => setMileageModalVehicle(null)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMileage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nova Leitura Real do Odômetro (km) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newKm}
                  onChange={(e) => setNewKm(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-base font-extrabold text-slate-900"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Leitura anterior: {mileageModalVehicle.currentKm.toLocaleString('pt-BR')} km em{' '}
                  {formatBRDate(mileageModalVehicle.lastKmUpdateDate)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data da Leitura *</label>
                  <input
                    type="date"
                    required
                    value={newKmDate}
                    onChange={(e) => setNewKmDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Média Diária Manual (km/dia)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Ex: 120"
                    value={newDailyAvg}
                    onChange={(e) => setNewDailyAvg(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-blue-600"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <p className="font-bold text-slate-700">Qual média usar nas projeções de manutenção?</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newAvgMode === 'manual'}
                    onChange={() => setNewAvgMode('manual')}
                  />
                  <span>Média informada manualmente ({newDailyAvg || '—'} km/dia)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newAvgMode === 'calculated'}
                    onChange={() => setNewAvgMode('calculated')}
                  />
                  <span>
                    Média real calculada pelo histórico (
                    {mileageModalVehicle.calculatedDailyKmAvg !== null
                      ? `${mileageModalVehicle.calculatedDailyKmAvg} km/dia`
                      : 'Requer 2+ leituras'}
                    )
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observação (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Conferência semanal da frota"
                  value={mileageNotes}
                  onChange={(e) => setMileageNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMileageModalVehicle(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                >
                  Registrar e Recalcular
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
