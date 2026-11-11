import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  FileText,
  Edit3,
  Trash2,
  X,
  Eye,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBRDate, formatCurrencyBRL, getInstallmentOpenBalanceCents } from '../../shared/calculations';
import { Client } from '../../shared/types';
import { InstallmentStatusBadge } from '../components/UiBadges';

export function ClientsPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    document: '',
    phone: '',
    whatsapp: '',
    email: '',
    address: '',
    cnhNumber: '',
    cnhExpiry: '',
    notes: '',
    attachments: [] as { id: string; name: string; type: string; uploadedAt: string }[],
  });

  if (!data) return null;

  const filteredClients = useMemo(() => {
    return data.clients.filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.document.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [data.clients, search]);

  const openCreateModal = () => {
    setEditingClient(null);
    setForm({
      fullName: '',
      document: '',
      phone: '',
      whatsapp: '',
      email: '',
      address: '',
      cnhNumber: '',
      cnhExpiry: '',
      notes: '',
      attachments: [],
    });
    setModalOpen(true);
  };

  const openEditModal = (c: Client) => {
    setEditingClient(c);
    setForm({
      fullName: c.fullName,
      document: c.document,
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      email: c.email || '',
      address: c.address || '',
      cnhNumber: c.cnhNumber || '',
      cnhExpiry: c.cnhExpiry || '',
      notes: c.notes || '',
      attachments: c.attachments || [],
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await apiFetch(`/api/clients/${editingClient.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        showToast('Cliente atualizado com sucesso!');
      } else {
        await apiFetch('/api/clients', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        showToast('Cliente cadastrado com sucesso!');
      }
      setModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (c: Client) => {
    if (!window.confirm(`Deseja remover o cliente ${c.fullName}?`)) return;
    try {
      await apiFetch(`/api/clients/${c.id}`, { method: 'DELETE' });
      showToast('Cliente removido.', 'info');
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleAddAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm((prev) => ({
      ...prev,
      attachments: [
        ...prev.attachments,
        {
          id: Math.random().toString(36).slice(2),
          name: file.name,
          type: file.type || 'documento',
          uploadedAt: new Date().toISOString().slice(0, 10),
        },
      ],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Clientes</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastro de locatários com controle de CNH, contatos e histórico completo de contratos e pagamentos.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ, telefone..."
          className="w-full pl-11 pr-4 py-2.5 bg-white rounded-2xl border border-slate-200 text-sm"
        />
      </div>

      {filteredClients.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Nenhum cliente cadastrado</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
            Cadastre seus clientes para vinculá-los aos veículos por meio de contratos de locação.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Primeiro Cliente
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-400">
                  <th className="py-3.5 pl-6">Nome Completo</th>
                  <th className="py-3.5">CPF / CNPJ</th>
                  <th className="py-3.5">WhatsApp / Telefone</th>
                  <th className="py-3.5">CNH & Validade</th>
                  <th className="py-3.5">Veículo Atual</th>
                  <th className="py-3.5">Situação Financeira</th>
                  <th className="py-3.5 text-right pr-6">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredClients.map((client) => {
                  const activeContract = data.contracts.find(
                    (c) => c.clientId === client.id && c.status === 'ativo'
                  );
                  const activeVehicle = activeContract
                    ? data.vehicles.find((v) => v.id === activeContract.vehicleId)
                    : null;
                  const clientInstallments = data.installments.filter(
                    (i) => i.clientId === client.id && i.status !== 'cancelada'
                  );
                  const overdueCount = clientInstallments.filter((i) => i.status === 'vencida').length;
                  const openTotalCents = clientInstallments.reduce(
                    (acc, i) => acc + getInstallmentOpenBalanceCents(i),
                    0
                  );

                  return (
                    <tr key={client.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-4 pl-6">
                        <strong className="text-slate-900 font-extrabold text-sm block">
                          {client.fullName}
                        </strong>
                        <span className="text-slate-400">{client.email || client.address || '—'}</span>
                      </td>
                      <td className="py-4 font-semibold text-slate-700">{client.document}</td>
                      <td className="py-4 text-slate-600">{client.whatsapp || client.phone || '—'}</td>
                      <td className="py-4 text-slate-600">
                        {client.cnhNumber ? (
                          <div>
                            <span className="font-bold text-slate-800">{client.cnhNumber}</span>
                            {client.cnhExpiry && (
                              <span className="block text-[11px] text-slate-400">
                                Val: {formatBRDate(client.cnhExpiry)}
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-4">
                        {activeVehicle ? (
                          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold">
                            {activeVehicle.plate} • {activeVehicle.model}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sem locação ativa</span>
                        )}
                      </td>
                      <td className="py-4">
                        {overdueCount > 0 ? (
                          <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-bold">
                            {overdueCount} parcela(s) em atraso
                          </span>
                        ) : openTotalCents > 0 ? (
                          <span className="text-slate-600 font-semibold">
                            A vencer: {formatCurrencyBRL(openTotalCents)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold">Em dia</span>
                        )}
                      </td>
                      <td className="py-4 text-right pr-6">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setDetailClient(client)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 font-bold"
                          >
                            Histórico
                          </button>
                          <button
                            onClick={() => openEditModal(client)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(client)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
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
        </div>
      )}

      {/* Create / Edit Client Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-full text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CPF ou CNPJ *</label>
                  <input
                    type="text"
                    required
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Número da CNH</label>
                  <input
                    type="text"
                    value={form.cnhNumber}
                    onChange={(e) => setForm({ ...form, cnhNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Validade da CNH</label>
                  <input
                    type="date"
                    value={form.cnhExpiry}
                    onChange={(e) => setForm({ ...form, cnhExpiry: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Documentos Anexados (opcional)</label>
                <div className="flex flex-wrap items-center gap-2">
                  {form.attachments.map((att) => (
                    <span
                      key={att.id}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold"
                    >
                      {att.name}
                    </span>
                  ))}
                  <label className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Anexar Documento
                    <input type="file" onChange={handleAddAttachment} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Full History Drawer/Modal (Section 7) */}
      {detailClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">{detailClient.fullName}</h3>
                <p className="text-xs text-slate-400">
                  CPF/CNPJ: {detailClient.document} • WhatsApp: {detailClient.whatsapp || detailClient.phone || '—'}
                </p>
              </div>
              <button onClick={() => setDetailClient(null)} className="p-1.5 rounded-full text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 text-xs">
              <div>
                <h4 className="font-extrabold text-slate-800 mb-2">Contratos & Veículos Alugados</h4>
                {data.contracts
                  .filter((c) => c.clientId === detailClient.id)
                  .map((c) => {
                    const v = data.vehicles.find((veh) => veh.id === c.vehicleId);
                    return (
                      <div
                        key={c.id}
                        className="p-3 rounded-2xl bg-slate-50 border border-slate-100 mb-2 flex items-center justify-between"
                      >
                        <div>
                          <strong className="text-slate-900">
                            {v ? `${v.brand} ${v.model} (${v.plate})` : 'Veículo'}
                          </strong>
                          <p className="text-slate-500">
                            {formatBRDate(c.startDate)} até{' '}
                            {c.isIndefinite ? 'Indeterminado' : formatBRDate(c.endDate)}
                          </p>
                        </div>
                        <span className="font-bold uppercase text-blue-600">{c.status}</span>
                      </div>
                    );
                  })}
              </div>

              <div>
                <h4 className="font-extrabold text-slate-800 mb-2">
                  Histórico de Pagamentos (Realizados, Pendentes e em Atraso)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {data.installments
                    .filter((i) => i.clientId === detailClient.id)
                    .map((inst) => (
                      <div
                        key={inst.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                      >
                        <div>
                          <span className="font-bold text-slate-800">
                            Parcela #{inst.installmentNumber} — Venc: {formatBRDate(inst.dueDate)}
                          </span>
                          <p className="text-slate-400">
                            Recebido: {formatCurrencyBRL(inst.paidAmountCents)} de{' '}
                            {formatCurrencyBRL(inst.expectedAmountCents)}
                          </p>
                        </div>
                        <InstallmentStatusBadge status={inst.status} />
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

