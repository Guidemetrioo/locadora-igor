import React, { useState } from 'react';
import { Settings, Save, Shield, Bell, Wrench, Building2, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MonthEndRule } from '../../shared/types';

export function SettingsPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();

  if (!data) return null;

  const s = data.settings;

  const [form, setForm] = useState({
    companyName: s.companyName || '',
    companyDocument: s.companyDocument || '',
    companyPhone: s.companyPhone || '',
    companyEmail: s.companyEmail || '',
    companyAddress: s.companyAddress || '',
    adminName: s.adminName || '',
    adminRole: s.adminRole || '',
    alertMaintenanceKmBefore:
      s.alertMaintenanceKmBefore !== null ? String(s.alertMaintenanceKmBefore) : '',
    alertMaintenanceDaysBefore:
      s.alertMaintenanceDaysBefore !== null ? String(s.alertMaintenanceDaysBefore) : '',
    alertPaymentDaysBefore:
      s.alertPaymentDaysBefore !== null ? String(s.alertPaymentDaysBefore) : '',
    alertContractEndDaysBefore:
      s.alertContractEndDaysBefore !== null ? String(s.alertContractEndDaysBefore) : '',
    defaultMonthEndRule: s.defaultMonthEndRule as MonthEndRule,
    defaultIndefiniteWindowDays:
      s.defaultIndefiniteWindowDays !== null ? String(s.defaultIndefiniteWindowDays) : '',
  });

  const [newCategory, setNewCategory] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [newComponent, setNewComponent] = useState('');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...s,
          ...form,
        }),
      });
      showToast('Configurações gerais salvas e aplicadas!');
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const addListItem = async (
    key: 'expenseCategories' | 'paymentMethods' | 'commonComponents',
    val: string,
    clearFn: () => void
  ) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (s[key].includes(trimmed)) return;
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...s,
          [key]: [...s[key], trimmed],
        }),
      });
      clearFn();
      await refreshState();
      showToast('Item adicionado!');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const removeListItem = async (
    key: 'expenseCategories' | 'paymentMethods' | 'commonComponents',
    val: string
  ) => {
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...s,
          [key]: s[key].filter((item) => item !== val),
        }),
      });
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100">
        <h2 className="text-xl font-extrabold text-slate-900">Configurações Gerais</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Personalize os dados da locadora, antecedências de alertas, regras de vencimento, formas de pagamento e catálogo de componentes.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Dados da Locadora */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4 text-xs">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Dados da Locadora & Administrador
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nome da Locadora</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">CNPJ / CPF</label>
              <input
                type="text"
                value={form.companyDocument}
                onChange={(e) => setForm({ ...form, companyDocument: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nome do Administrador</label>
              <input
                type="text"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Cargo / Perfil</label>
              <input
                type="text"
                value={form.adminRole}
                onChange={(e) => setForm({ ...form, adminRole: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
              <input
                type="text"
                value={form.companyPhone}
                onChange={(e) => setForm({ ...form, companyPhone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={form.companyEmail}
                onChange={(e) => setForm({ ...form, companyEmail: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
          </div>
        </div>

        {/* Card 2: Parâmetros de Alertas e Regras de Cobrança */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4 text-xs">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            Parâmetros de Alertas & Regras de Vencimento
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Alerta Manutenção Próxima (Km antes)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 1000 km"
                value={form.alertMaintenanceKmBefore}
                onChange={(e) => setForm({ ...form, alertMaintenanceKmBefore: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold text-blue-600"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Alerta Manutenção Próxima (Dias antes)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 15 dias"
                value={form.alertMaintenanceDaysBefore}
                onChange={(e) => setForm({ ...form, alertMaintenanceDaysBefore: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold text-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Alerta de Pagamento Próximo (Dias antes)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 3 dias"
                value={form.alertPaymentDaysBefore}
                onChange={(e) => setForm({ ...form, alertPaymentDaysBefore: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Alerta Fim de Contrato (Dias antes)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 7 dias"
                value={form.alertContractEndDaysBefore}
                onChange={(e) => setForm({ ...form, alertContractEndDaysBefore: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Regra para Dias Inexistentes no Mês (ex: dia 31)
              </label>
              <select
                value={form.defaultMonthEndRule}
                onChange={(e) =>
                  setForm({ ...form, defaultMonthEndRule: e.target.value as MonthEndRule })
                }
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
              >
                <option value="ultimo_dia_valido">Último dia válido do mês (ex: 28/Fev)</option>
                <option value="proximo_dia_util">Próximo dia útil do mês seguinte</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Janela Padrão p/ Contrato Indeterminado (dias)
              </label>
              <input
                type="number"
                min="7"
                placeholder="Ex: 30 ou 60 dias"
                value={form.defaultIndefiniteWindowDays}
                onChange={(e) => setForm({ ...form, defaultIndefiniteWindowDays: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/20"
            >
              <Save className="w-4 h-4" />
              Salvar Configurações
            </button>
          </div>
        </div>
      </form>

      {/* Catalogs Customization */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        {/* Expense Categories */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-3">
          <h4 className="font-extrabold text-slate-900">Categorias de Despesas</h4>
          <div className="flex flex-wrap gap-1.5">
            {s.expenseCategories.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold"
              >
                {c}
                <button
                  type="button"
                  onClick={() => removeListItem('expenseCategories', c)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Nova categoria..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200"
            />
            <button
              type="button"
              onClick={() => addListItem('expenseCategories', newCategory, () => setNewCategory(''))}
              className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-3">
          <h4 className="font-extrabold text-slate-900">Formas de Pagamento</h4>
          <div className="flex flex-wrap gap-1.5">
            {s.paymentMethods.map((pm) => (
              <span
                key={pm}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold"
              >
                {pm}
                <button
                  type="button"
                  onClick={() => removeListItem('paymentMethods', pm)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Nova forma..."
              value={newPaymentMethod}
              onChange={(e) => setNewPaymentMethod(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200"
            />
            <button
              type="button"
              onClick={() =>
                addListItem('paymentMethods', newPaymentMethod, () => setNewPaymentMethod(''))
              }
              className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Common Maintenance Components */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-3">
          <h4 className="font-extrabold text-slate-900">Catálogo de Serviços / Peças</h4>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
            {s.commonComponents.map((comp) => (
              <span
                key={comp}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-800 font-semibold"
              >
                {comp}
                <button
                  type="button"
                  onClick={() => removeListItem('commonComponents', comp)}
                  className="text-cyan-500 hover:text-rose-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Novo serviço/peça..."
              value={newComponent}
              onChange={(e) => setNewComponent(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200"
            />
            <button
              type="button"
              onClick={() => addListItem('commonComponents', newComponent, () => setNewComponent(''))}
              className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

