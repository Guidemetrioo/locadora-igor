import React, { useState } from 'react';
import {
  FileText,
  Plus,
  CheckCircle2,
  X,
  Calendar,
  Car,
  User,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBRDate, formatCurrencyBRL } from '../../shared/calculations';
import { Contract, BillingFrequency } from '../../shared/types';

const WEEKDAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

export function ContractsPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [closingContract, setClosingContract] = useState<Contract | null>(null);
  const [returnKm, setReturnKm] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [updateDailyAvgOnClose, setUpdateDailyAvgOnClose] = useState(true);
  const [cancelFutureOnClose, setCancelFutureOnClose] = useState(true);

  const [form, setForm] = useState({
    clientId: '',
    vehicleId: '',
    startDate: '',
    endDate: '',
    isIndefinite: false,
    amountBRL: '',
    frequency: 'semanal' as BillingFrequency,
    weeklyDay: 2, // Terça-feira as interactive selection, changeable freely
    monthlyDay: 10,
    customIntervalDays: '',
    monthEndRule: 'ultimo_dia_valido',
    indefiniteWindowDays: '',
    deliveryKm: '',
    paymentMethod: 'PIX',
    notes: '',
  });

  if (!data) return null;

  const openCreateModal = () => {
    const firstClient = data.clients[0];
    const firstAvailableVehicle =
      data.vehicles.find((v) => v.status === 'disponivel') || data.vehicles[0];

    setForm({
      clientId: firstClient ? firstClient.id : '',
      vehicleId: firstAvailableVehicle ? firstAvailableVehicle.id : '',
      startDate: data.todayIso,
      endDate: '',
      isIndefinite: false,
      amountBRL: '',
      frequency: 'semanal',
      weeklyDay: 2,
      monthlyDay: 10,
      customIntervalDays: '',
      monthEndRule: data.settings.defaultMonthEndRule || 'ultimo_dia_valido',
      indefiniteWindowDays:
        data.settings.defaultIndefiniteWindowDays !== null
          ? String(data.settings.defaultIndefiniteWindowDays)
          : '',
      deliveryKm: firstAvailableVehicle ? String(firstAvailableVehicle.currentKm) : '0',
      paymentMethod: data.settings.paymentMethods[0] || 'PIX',
      notes: '',
    });
    setCreateModalOpen(true);
  };

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amountCents = Math.round(Number(form.amountBRL.replace(',', '.')) * 100);
      const res = await apiFetch('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          vehicleId: form.vehicleId,
          startDate: form.startDate,
          endDate: form.isIndefinite ? null : form.endDate,
          isIndefinite: form.isIndefinite,
          amountCents,
          frequency: form.frequency,
          weeklyDay: form.frequency === 'semanal' ? Number(form.weeklyDay) : null,
          monthlyDay: form.frequency === 'mensal' ? Number(form.monthlyDay) : null,
          customIntervalDays:
            form.frequency === 'personalizado' && form.customIntervalDays !== ''
              ? Number(form.customIntervalDays)
              : null,
          monthEndRule: form.monthEndRule,
          indefiniteWindowDays:
            form.isIndefinite && form.indefiniteWindowDays !== ''
              ? Number(form.indefiniteWindowDays)
              : null,
          deliveryKm: Number(form.deliveryKm),
          paymentMethod: form.paymentMethod,
          notes: form.notes,
        }),
      });
      showToast(
        `Contrato criado! ${res.generatedInstallmentsCount} parcela(s) gerada(s) automaticamente.`
      );
      setCreateModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCloseContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingContract) return;
    try {
      await apiFetch(`/api/contracts/${closingContract.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          returnKm: Number(returnKm),
          returnDate: returnDate || data.todayIso,
          updateVehicleDailyAvg: updateDailyAvgOnClose,
          cancelFuturePendingInstallments: cancelFutureOnClose,
        }),
      });
      showToast('Contrato finalizado e quilometragem de devolução registrada!');
      setClosingContract(null);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleGenerateMoreInstallments = async (contract: Contract) => {
    const daysStr = window.prompt(
      'Gerar parcelas para quantos dias futuros a partir do último vencimento?',
      String(contract.indefiniteWindowDays || 30)
    );
    if (!daysStr) return;
    try {
      const res = await apiFetch(`/api/contracts/${contract.id}/generate-more`, {
        method: 'POST',
        body: JSON.stringify({ windowDays: Number(daysStr) }),
      });
      showToast(`${res.added} nova(s) parcela(s) gerada(s)!`);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Contratos de Locação</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Vincule clientes a veículos com geração automática de parcelas semanais, quinzenais, mensais ou personalizadas.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          Novo Contrato
        </button>
      </div>

      {data.contracts.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-200">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Nenhum contrato registrado</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
            Ao cadastrar um contrato e definir a frequência (ex: toda terça-feira ou todo dia 10), o sistema gera automaticamente todas as parcelas no calendário e no financeiro.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            Criar Primeiro Contrato
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {data.contracts.map((contract) => {
            const client = data.clients.find((c) => c.id === contract.clientId);
            const vehicle = data.vehicles.find((v) => v.id === contract.vehicleId);
            const contractInstallments = data.installments.filter(
              (i) => i.contractId === contract.id && i.status !== 'cancelada'
            );
            const paidCount = contractInstallments.filter((i) => i.status === 'paga').length;

            const freqLabel =
              contract.frequency === 'semanal'
                ? `Semanal (${WEEKDAYS.find((w) => w.value === contract.weeklyDay)?.label || ''})`
                : contract.frequency === 'mensal'
                ? `Mensal (Todo dia ${contract.monthlyDay})`
                : contract.frequency === 'quinzenal'
                ? 'Quinzenal (a cada 15 dias)'
                : `Personalizado (a cada ${contract.customIntervalDays} dias)`;

            return (
              <div
                key={contract.id}
                className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-extrabold text-xs">
                        {vehicle?.plate || 'VEÍCULO'}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 mt-1">
                        {client?.fullName || 'Cliente'}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {vehicle ? `${vehicle.brand} ${vehicle.model}` : ''}
                      </p>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        contract.status === 'ativo'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {contract.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Valor da Parcela</span>
                      <strong className="text-blue-600 font-extrabold text-sm">
                        {formatCurrencyBRL(contract.amountCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Regra de Cobrança</span>
                      <strong className="text-slate-800">{freqLabel}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Vigência</span>
                      <strong className="text-slate-800">
                        {formatBRDate(contract.startDate)} →{' '}
                        {contract.isIndefinite ? 'Indeterminado' : formatBRDate(contract.endDate)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Km Entrega</span>
                      <strong className="text-slate-800">
                        {contract.deliveryKm.toLocaleString('pt-BR')} km
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Km Devolução</span>
                      <strong className="text-slate-800">
                        {contract.returnKm !== null
                          ? `${contract.returnKm.toLocaleString('pt-BR')} km`
                          : 'Em uso'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Parcelas Pagas</span>
                      <strong className="text-emerald-600">
                        {paidCount} / {contractInstallments.length}
                      </strong>
                    </div>
                  </div>
                </div>

                {contract.status === 'ativo' && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    {contract.isIndefinite && (
                      <button
                        onClick={() => handleGenerateMoreInstallments(contract)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Gerar Próximo Período
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setClosingContract(contract);
                        setReturnKm(String(vehicle?.currentKm || contract.deliveryKm));
                        setReturnDate(data.todayIso);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Encerrar / Devolver Veículo
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Contract Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Novo Contrato de Locação</h3>
                <p className="text-xs text-slate-400">
                  As parcelas serão geradas automaticamente para o calendário e controle financeiro.
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContract} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cliente *</label>
                  <select
                    required
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="">Selecione o cliente...</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.document})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Veículo *</label>
                  <select
                    required
                    value={form.vehicleId}
                    onChange={(e) => {
                      const v = data.vehicles.find((veh) => veh.id === e.target.value);
                      setForm({
                        ...form,
                        vehicleId: e.target.value,
                        deliveryKm: v ? String(v.currentKm) : form.deliveryKm,
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="">Selecione o veículo...</option>
                    {data.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} — {v.brand} {v.model} ({v.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data de Início *</label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Data Prevista de Término {form.isIndefinite ? '(Indeterminado)' : '*'}
                  </label>
                  <input
                    type="date"
                    disabled={form.isIndefinite}
                    required={!form.isIndefinite}
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-100"
                  />
                </div>

                <div className="flex flex-col justify-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.isIndefinite}
                      onChange={(e) => setForm({ ...form, isIndefinite: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Prazo Indeterminado</span>
                  </label>
                </div>
              </div>

              {/* Billing Frequency & Exact Day Configuration (Section 5) */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-3">
                <h4 className="font-extrabold text-blue-800 uppercase tracking-wider text-[11px]">
                  Configuração de Cobrança Recorrente
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Valor da Parcela (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Ex: 650,00"
                      value={form.amountBRL}
                      onChange={(e) => setForm({ ...form, amountBRL: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-extrabold text-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Frequência de Pagamento *
                    </label>
                    <select
                      value={form.frequency}
                      onChange={(e) =>
                        setForm({ ...form, frequency: e.target.value as BillingFrequency })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal (15 dias)</option>
                      <option value="mensal">Mensal</option>
                      <option value="personalizado">Personalizado (N dias)</option>
                    </select>
                  </div>

                  {form.frequency === 'semanal' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Dia da Semana do Vencimento *
                      </label>
                      <select
                        value={form.weeklyDay}
                        onChange={(e) => setForm({ ...form, weeklyDay: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-900"
                      >
                        {WEEKDAYS.map((w) => (
                          <option key={w.value} value={w.value}>
                            Toda {w.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {form.frequency === 'mensal' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Dia do Mês (1 a 31) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        required
                        value={form.monthlyDay}
                        onChange={(e) => setForm({ ...form, monthlyDay: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                      />
                    </div>
                  )}

                  {form.frequency === 'personalizado' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Intervalo em Dias *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Ex: 10 ou 20"
                        value={form.customIntervalDays}
                        onChange={(e) => setForm({ ...form, customIntervalDays: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                      />
                    </div>
                  )}
                </div>

                {form.isIndefinite && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Janela futura para gerar cobranças (em dias) *
                    </label>
                    <input
                      type="number"
                      min="7"
                      required
                      placeholder="Ex: 30, 60 ou 90 dias"
                      value={form.indefiniteWindowDays}
                      onChange={(e) => setForm({ ...form, indefiniteWindowDays: e.target.value })}
                      className="w-full sm:w-64 px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Quilometragem na Entrega (km) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.deliveryKm}
                    onChange={(e) => setForm({ ...form, deliveryKm: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    {data.settings.paymentMethods.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/20"
                >
                  Criar Contrato e Gerar Parcelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Contract Modal */}
      {closingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900 mb-2">
              Encerrar Contrato e Registrar Devolução
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Km na entrega: <strong>{closingContract.deliveryKm.toLocaleString('pt-BR')} km</strong>
            </p>
            <form onSubmit={handleCloseContract} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Quilometragem Real na Devolução (km) *
                </label>
                <input
                  type="number"
                  required
                  min={closingContract.deliveryKm}
                  value={returnKm}
                  onChange={(e) => setReturnKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-extrabold text-base"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Data da Devolução *</label>
                <input
                  type="date"
                  required
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={updateDailyAvgOnClose}
                  onChange={(e) => setUpdateDailyAvgOnClose(e.target.checked)}
                />
                <span>Atualizar média diária do veículo com base no período desta locação</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={cancelFutureOnClose}
                  onChange={(e) => setCancelFutureOnClose(e.target.checked)}
                />
                <span>Cancelar parcelas futuras pendentes após a data de devolução</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setClosingContract(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
