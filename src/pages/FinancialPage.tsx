import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Plus,
  CheckCircle2,
  Edit3,
  Trash2,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatBRDate,
  formatCurrencyBRL,
  getInstallmentNetTotalCents,
  getInstallmentOpenBalanceCents,
} from '../../shared/calculations';
import { Installment } from '../../shared/types';
import { InstallmentStatusBadge } from '../components/UiBadges';

export function FinancialPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();

  const [tab, setTab] = useState<'recebimentos' | 'despesas' | 'por_veiculo'>('recebimentos');
  const [vehicleFilter, setVehicleFilter] = useState('todos');
  const [clientFilter, setClientFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Register Payment Modal
  const [payingInst, setPayingInst] = useState<Installment | null>(null);
  const [payForm, setPayForm] = useState({
    amountBRL: '',
    paymentDate: '',
    paymentMethod: 'PIX',
    discountBRL: '0,00',
    surchargeBRL: '0,00',
    notes: '',
  });

  // Reschedule / Edit Installment Modal
  const [editingInst, setEditingInst] = useState<Installment | null>(null);
  const [editInstForm, setEditInstForm] = useState({
    dueDate: '',
    expectedAmountBRL: '',
    discountBRL: '',
    surchargeBRL: '',
    status: 'pendente',
    notes: '',
  });

  // Standalone Receivable Modal
  const [newInstModalOpen, setNewInstModalOpen] = useState(false);
  const [newInstForm, setNewInstForm] = useState({
    clientId: '',
    vehicleId: '',
    dueDate: '',
    expectedAmountBRL: '',
    paymentMethod: 'PIX',
    notes: '',
  });

  // Expense Modal
  const [newExpModalOpen, setNewExpModalOpen] = useState(false);
  const [newExpForm, setNewExpForm] = useState({
    vehicleId: '',
    category: 'Manutenção',
    description: '',
    amountBRL: '',
    date: '',
    status: 'paga',
    notes: '',
  });

  if (!data) return null;

  const filteredInstallments = useMemo(() => {
    return data.installments
      .filter((i) => {
        if (vehicleFilter !== 'todos' && i.vehicleId !== vehicleFilter) return false;
        if (clientFilter !== 'todos' && i.clientId !== clientFilter) return false;
        if (statusFilter !== 'todos' && i.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [data.installments, vehicleFilter, clientFilter, statusFilter]);

  const filteredExpenses = useMemo(() => {
    return data.expenses
      .filter((e) => {
        if (vehicleFilter !== 'todos' && e.vehicleId !== vehicleFilter) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.expenses, vehicleFilter]);

  const totals = useMemo(() => {
    let expected = 0;
    let received = 0;
    let open = 0;
    for (const i of filteredInstallments) {
      if (i.status === 'cancelada') continue;
      expected += getInstallmentNetTotalCents(i);
      received += i.paidAmountCents || 0;
      open += getInstallmentOpenBalanceCents(i);
    }
    const expenses = filteredExpenses.reduce((acc, e) => acc + e.amountCents, 0);
    return { expected, received, open, expenses, result: received - expenses };
  }, [filteredInstallments, filteredExpenses]);

  const openPayModal = (inst: Installment) => {
    const openBalance = getInstallmentOpenBalanceCents(inst);
    setPayingInst(inst);
    setPayForm({
      amountBRL: (openBalance / 100).toFixed(2),
      paymentDate: data.todayIso,
      paymentMethod: inst.paymentMethod || 'PIX',
      discountBRL: ((inst.discountCents || 0) / 100).toFixed(2),
      surchargeBRL: ((inst.surchargeCents || 0) / 100).toFixed(2),
      notes: inst.notes || '',
    });
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInst) return;
    try {
      const amountCents = Math.round(Number(payForm.amountBRL.replace(',', '.')) * 100);
      const discountCents = Math.round(Number(payForm.discountBRL.replace(',', '.')) * 100);
      const surchargeCents = Math.round(Number(payForm.surchargeBRL.replace(',', '.')) * 100);

      await apiFetch(`/api/installments/${payingInst.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          amountCents,
          paymentDate: payForm.paymentDate,
          paymentMethod: payForm.paymentMethod,
          discountCents,
          surchargeCents,
          notes: payForm.notes,
        }),
      });
      showToast('Pagamento registrado com sucesso!');
      setPayingInst(null);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openEditInstModal = (inst: Installment) => {
    setEditingInst(inst);
    setEditInstForm({
      dueDate: inst.dueDate,
      expectedAmountBRL: (inst.expectedAmountCents / 100).toFixed(2),
      discountBRL: ((inst.discountCents || 0) / 100).toFixed(2),
      surchargeBRL: ((inst.surchargeCents || 0) / 100).toFixed(2),
      status: inst.status,
      notes: inst.notes || '',
    });
  };

  const handleSaveInstEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInst) return;
    try {
      await apiFetch(`/api/installments/${editingInst.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          dueDate: editInstForm.dueDate,
          expectedAmountCents: Math.round(
            Number(editInstForm.expectedAmountBRL.replace(',', '.')) * 100
          ),
          discountCents: Math.round(Number(editInstForm.discountBRL.replace(',', '.')) * 100),
          surchargeCents: Math.round(Number(editInstForm.surchargeBRL.replace(',', '.')) * 100),
          status: editInstForm.status,
          notes: editInstForm.notes,
        }),
      });
      showToast('Parcela atualizada!');
      setEditingInst(null);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/installments', {
        method: 'POST',
        body: JSON.stringify({
          clientId: newInstForm.clientId,
          vehicleId: newInstForm.vehicleId,
          dueDate: newInstForm.dueDate,
          expectedAmountCents: Math.round(
            Number(newInstForm.expectedAmountBRL.replace(',', '.')) * 100
          ),
          paymentMethod: newInstForm.paymentMethod,
          notes: newInstForm.notes,
        }),
      });
      showToast('Cobrança cadastrada!');
      setNewInstModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          vehicleId: newExpForm.vehicleId,
          category: newExpForm.category,
          description: newExpForm.description,
          amountCents: Math.round(Number(newExpForm.amountBRL.replace(',', '.')) * 100),
          date: newExpForm.date || data.todayIso,
          status: newExpForm.status,
          notes: newExpForm.notes,
        }),
      });
      showToast('Despesa registrada!');
      setNewExpModalOpen(false);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Deseja excluir esta despesa?')) return;
    try {
      await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
      showToast('Despesa excluída.', 'info');
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <span className="text-xs font-semibold text-slate-400">Total Previsto</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {formatCurrencyBRL(totals.expected)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <span className="text-xs font-semibold text-emerald-600">Efetivamente Recebido</span>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">
            {formatCurrencyBRL(totals.received)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <span className="text-xs font-semibold text-amber-600">Em Aberto / A Receber</span>
          <p className="text-xl font-extrabold text-amber-600 mt-1">
            {formatCurrencyBRL(totals.open)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <span className="text-xs font-semibold text-rose-600">Despesas Registradas</span>
          <p className="text-xl font-extrabold text-rose-600 mt-1">
            {formatCurrencyBRL(totals.expenses)}
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <span className="text-xs font-semibold text-blue-600">Resultado Operacional</span>
          <p
            className={`text-xl font-extrabold mt-1 ${
              totals.result >= 0 ? 'text-blue-600' : 'text-rose-600'
            }`}
          >
            {formatCurrencyBRL(totals.result)}
          </p>
        </div>
      </div>

      {/* Tabs & Actions */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setTab('recebimentos')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'recebimentos'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Controle de Parcelas & Recebimentos
          </button>
          <button
            onClick={() => setTab('despesas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'despesas'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Despesas por Veículo
          </button>
          <button
            onClick={() => setTab('por_veiculo')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'por_veiculo'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Rentabilidade por Veículo
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
          >
            <option value="todos">Todos os veículos</option>
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.model}
              </option>
            ))}
          </select>

          {tab === 'recebimentos' && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
              >
                <option value="todos">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="parcialmente_paga">Parcialmente Paga</option>
                <option value="vencida">Vencida</option>
                <option value="paga">Paga</option>
              </select>

              <button
                onClick={() => {
                  setNewInstForm({
                    clientId: data.clients[0]?.id || '',
                    vehicleId: data.vehicles[0]?.id || '',
                    dueDate: data.todayIso,
                    expectedAmountBRL: '',
                    paymentMethod: 'PIX',
                    notes: '',
                  });
                  setNewInstModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Nova Cobrança
              </button>
            </>
          )}

          {tab === 'despesas' && (
            <button
              onClick={() => {
                setNewExpForm({
                  vehicleId: data.vehicles[0]?.id || '',
                  category: 'Manutenção',
                  description: '',
                  amountBRL: '',
                  date: data.todayIso,
                  status: 'paga',
                  notes: '',
                });
                setNewExpModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              Lançar Despesa
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: PARCELAS E RECEBIMENTOS */}
      {tab === 'recebimentos' && (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
          {filteredInstallments.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Nenhuma parcela encontrada com os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-400">
                    <th className="py-3.5 pl-5">#</th>
                    <th className="py-3.5">Cliente</th>
                    <th className="py-3.5">Veículo</th>
                    <th className="py-3.5">Vencimento</th>
                    <th className="py-3.5">Valor Previsto</th>
                    <th className="py-3.5">Valor Recebido</th>
                    <th className="py-3.5">Saldo Devedor</th>
                    <th className="py-3.5">Status</th>
                    <th className="py-3.5 text-right pr-5">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredInstallments.map((inst) => {
                    const client = data.clients.find((c) => c.id === inst.clientId);
                    const vehicle = data.vehicles.find((v) => v.id === inst.vehicleId);
                    const netTotal = getInstallmentNetTotalCents(inst);
                    const openBalance = getInstallmentOpenBalanceCents(inst);

                    return (
                      <tr key={inst.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 pl-5 font-bold text-slate-500">
                          #{inst.installmentNumber}
                        </td>
                        <td className="py-3.5 font-extrabold text-slate-900">
                          {client?.fullName || 'Cliente'}
                        </td>
                        <td className="py-3.5 text-slate-700 font-semibold">
                          {vehicle ? `${vehicle.plate} • ${vehicle.model}` : '—'}
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">
                          {formatBRDate(inst.dueDate)}
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">
                          {formatCurrencyBRL(netTotal)}
                        </td>
                        <td className="py-3.5 font-extrabold text-emerald-600">
                          {formatCurrencyBRL(inst.paidAmountCents)}
                          {inst.lastPaymentDate && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              em {formatBRDate(inst.lastPaymentDate)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 font-extrabold text-slate-900">
                          {formatCurrencyBRL(openBalance)}
                        </td>
                        <td className="py-3.5">
                          <InstallmentStatusBadge status={inst.status} />
                        </td>
                        <td className="py-3.5 text-right pr-5">
                          <div className="inline-flex items-center gap-1.5">
                            {inst.status !== 'paga' && inst.status !== 'cancelada' && (
                              <button
                                onClick={() => openPayModal(inst)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                              >
                                Receber
                              </button>
                            )}
                            <button
                              onClick={() => openEditInstModal(inst)}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                              title="Reagendar vencimento, desconto ou acréscimo"
                            >
                              <Edit3 className="w-4 h-4" />
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
      )}

      {/* TAB 2: DESPESAS */}
      {tab === 'despesas' && (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Nenhuma despesa registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-400">
                    <th className="py-3.5 pl-5">Data</th>
                    <th className="py-3.5">Veículo</th>
                    <th className="py-3.5">Categoria</th>
                    <th className="py-3.5">Descrição</th>
                    <th className="py-3.5">Origem</th>
                    <th className="py-3.5">Valor</th>
                    <th className="py-3.5 text-right pr-5">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredExpenses.map((exp) => {
                    const v = data.vehicles.find((veh) => veh.id === exp.vehicleId);
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 pl-5 font-semibold text-slate-700">
                          {formatBRDate(exp.date)}
                        </td>
                        <td className="py-3.5 font-extrabold text-slate-900">
                          {v ? `${v.plate} • ${v.model}` : 'Veículo'}
                        </td>
                        <td className="py-3.5">
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">{exp.description}</td>
                        <td className="py-3.5 text-slate-500">
                          {exp.maintenanceHistoryId ? 'Automática (Manutenção)' : 'Manual'}
                        </td>
                        <td className="py-3.5 font-extrabold text-rose-600">
                          {formatCurrencyBRL(exp.amountCents)}
                        </td>
                        <td className="py-3.5 text-right pr-5">
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* TAB 3: RENTABILIDADE POR VEÍCULO (Section 9) */}
      {tab === 'por_veiculo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.vehicles.map((v) => {
            const vInst = data.installments.filter(
              (i) => i.vehicleId === v.id && i.status !== 'cancelada'
            );
            const expected = vInst.reduce((s, i) => s + getInstallmentNetTotalCents(i), 0);
            const received = vInst.reduce((s, i) => s + (i.paidAmountCents || 0), 0);
            const vExp = data.expenses.filter((e) => e.vehicleId === v.id);
            const totalExp = vExp.reduce((s, e) => s + e.amountCents, 0);
            const maintExp = vExp
              .filter((e) => e.category === 'Manutenção' || e.maintenanceHistoryId)
              .reduce((s, e) => s + e.amountCents, 0);
            const result = received - totalExp;

            return (
              <div
                key={v.id}
                className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-3 text-xs"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-extrabold">
                      {v.plate}
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-1">
                      {v.brand} {v.model}
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block">Resultado Operacional</span>
                    <strong
                      className={`text-base font-extrabold ${
                        result >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {formatCurrencyBRL(result)}
                    </strong>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Receita Prevista:</span>
                    <strong className="text-slate-800">{formatCurrencyBRL(expected)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Receita Recebida:</span>
                    <strong className="text-emerald-600">{formatCurrencyBRL(received)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Despesas Realizadas:</span>
                    <strong className="text-rose-600">{formatCurrencyBRL(totalExp)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Custos Acumulados de Manutenção:</span>
                    <strong className="text-slate-800">{formatCurrencyBRL(maintExp)}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Modal (Supports full, partial, early or late payments) */}
      {payingInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Registrar Recebimento • Parcela #{payingInst.installmentNumber}
                </h3>
                <p className="text-xs text-slate-400">
                  Permite pagamento integral ou parcial (o saldo restante será preservado).
                </p>
              </div>
              <button onClick={() => setPayingInst(null)} className="p-1.5 rounded-full text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Valor Recebido Agora (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payForm.amountBRL}
                    onChange={(e) => setPayForm({ ...payForm, amountBRL: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-extrabold text-base text-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data do Recebimento *</label>
                  <input
                    type="date"
                    required
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Forma Pagto</label>
                  <select
                    value={payForm.paymentMethod}
                    onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {data.settings.paymentMethods.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payForm.discountBRL}
                    onChange={(e) => setPayForm({ ...payForm, discountBRL: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Acréscimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payForm.surchargeBRL}
                    onChange={(e) => setPayForm({ ...payForm, surchargeBRL: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações</label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayingInst(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Reschedule Installment Modal */}
      {editingInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">
              Reagendar / Ajustar Parcela #{editingInst.installmentNumber}
            </h3>
            <form onSubmit={handleSaveInstEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nova Data de Vencimento</label>
                  <input
                    type="date"
                    required
                    value={editInstForm.dueDate}
                    onChange={(e) => setEditInstForm({ ...editInstForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor Base (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editInstForm.expectedAmountBRL}
                    onChange={(e) =>
                      setEditInstForm({ ...editInstForm, expectedAmountBRL: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Desconto Manual (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editInstForm.discountBRL}
                    onChange={(e) =>
                      setEditInstForm({ ...editInstForm, discountBRL: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Acréscimo Manual (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editInstForm.surchargeBRL}
                    onChange={(e) =>
                      setEditInstForm({ ...editInstForm, surchargeBRL: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Situação</label>
                <select
                  value={editInstForm.status}
                  onChange={(e) => setEditInstForm({ ...editInstForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="pendente">Ativa (Pendente / Vencida)</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingInst(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standalone Receivable Modal */}
      {newInstModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">Cadastrar Cobrança</h3>
            <form onSubmit={handleCreateInstallment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cliente *</label>
                <select
                  required
                  value={newInstForm.clientId}
                  onChange={(e) => setNewInstForm({ ...newInstForm, clientId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">Selecione...</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Veículo *</label>
                <select
                  required
                  value={newInstForm.vehicleId}
                  onChange={(e) => setNewInstForm({ ...newInstForm, vehicleId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">Selecione...</option>
                  {data.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.model}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={newInstForm.dueDate}
                    onChange={(e) => setNewInstForm({ ...newInstForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInstForm.expectedAmountBRL}
                    onChange={(e) =>
                      setNewInstForm({ ...newInstForm, expectedAmountBRL: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setNewInstModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  Salvar Cobrança
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Expense Modal */}
      {newExpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">Lançar Despesa de Veículo</h3>
            <form onSubmit={handleCreateExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Veículo *</label>
                <select
                  required
                  value={newExpForm.vehicleId}
                  onChange={(e) => setNewExpForm({ ...newExpForm, vehicleId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
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
                <label className="block font-bold text-slate-700 mb-1">Categoria *</label>
                <select
                  value={newExpForm.category}
                  onChange={(e) => setNewExpForm({ ...newExpForm, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {data.settings.expenseCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={newExpForm.description}
                  onChange={(e) => setNewExpForm({ ...newExpForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newExpForm.amountBRL}
                    onChange={(e) => setNewExpForm({ ...newExpForm, amountBRL: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={newExpForm.date}
                    onChange={(e) => setNewExpForm({ ...newExpForm, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setNewExpModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white font-bold"
                >
                  Salvar Despesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

