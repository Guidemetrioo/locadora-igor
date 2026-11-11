import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatBRDate,
  formatCurrencyBRL,
  getInstallmentNetTotalCents,
  getInstallmentOpenBalanceCents,
  parseISODate,
  formatISODate,
} from '../../shared/calculations';
import { Installment } from '../../shared/types';
import { InstallmentStatusBadge } from '../components/UiBadges';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CalendarPage() {
  const { data, apiFetch, refreshState, showToast } = useApp();

  const [viewMode, setViewMode] = useState<'mensal' | 'semanal'>('mensal');
  const [cursorDateIso, setCursorDateIso] = useState<string>(
    () => data?.todayIso || new Date().toISOString().slice(0, 10)
  );
  const [vehicleFilter, setVehicleFilter] = useState('todos');
  const [clientFilter, setClientFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [payAmountBRL, setPayAmountBRL] = useState('');

  if (!data) return null;

  const cursorObj = parseISODate(cursorDateIso);
  const year = cursorObj.getUTCFullYear();
  const monthIdx = cursorObj.getUTCMonth();

  const filteredInstallments = useMemo(() => {
    return data.installments.filter((i) => {
      if (i.status === 'cancelada') return false;
      if (vehicleFilter !== 'todos' && i.vehicleId !== vehicleFilter) return false;
      if (clientFilter !== 'todos' && i.clientId !== clientFilter) return false;
      if (statusFilter !== 'todos' && i.status !== statusFilter) return false;
      return true;
    });
  }, [data.installments, vehicleFilter, clientFilter, statusFilter]);

  const calendarDays = useMemo(() => {
    if (viewMode === 'mensal') {
      const firstDayOfMonth = new Date(Date.UTC(year, monthIdx, 1));
      const startDow = firstDayOfMonth.getUTCDay();
      const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

      const cells: { iso: string; dayNum: number; inCurrentMonth: boolean }[] = [];
      for (let i = startDow - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(year, monthIdx, -i));
        cells.push({ iso: formatISODate(d), dayNum: d.getUTCDate(), inCurrentMonth: false });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(Date.UTC(year, monthIdx, d));
        cells.push({ iso: formatISODate(dt), dayNum: d, inCurrentMonth: true });
      }
      while (cells.length % 7 !== 0) {
        const last = parseISODate(cells[cells.length - 1].iso);
        last.setUTCDate(last.getUTCDate() + 1);
        cells.push({ iso: formatISODate(last), dayNum: last.getUTCDate(), inCurrentMonth: false });
      }
      return cells;
    } else {
      // Weekly view: 7 days around cursorDateIso starting Sunday
      const d = parseISODate(cursorDateIso);
      const dow = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - dow);
      const cells: { iso: string; dayNum: number; inCurrentMonth: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        cells.push({
          iso: formatISODate(d),
          dayNum: d.getUTCDate(),
          inCurrentMonth: true,
        });
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return cells;
    }
  }, [viewMode, year, monthIdx, cursorDateIso]);

  const stepPeriod = (dir: -1 | 1) => {
    const d = parseISODate(cursorDateIso);
    if (viewMode === 'mensal') {
      d.setUTCMonth(d.getUTCMonth() + dir);
    } else {
      d.setUTCDate(d.getUTCDate() + dir * 7);
    }
    setCursorDateIso(formatISODate(d));
  };

  const handleQuickReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment) return;
    try {
      const amountCents = Math.round(Number(payAmountBRL.replace(',', '.')) * 100);
      await apiFetch(`/api/installments/${selectedInstallment.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          amountCents,
          paymentDate: data.todayIso,
          paymentMethod: selectedInstallment.paymentMethod || 'PIX',
        }),
      });
      showToast('Recebimento registrado pelo calendário!');
      setSelectedInstallment(null);
      await refreshState();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => stepPeriod(-1)}
              className="p-2 rounded-xl hover:bg-white text-slate-700 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 font-extrabold text-sm text-slate-900 min-w-[150px] text-center">
              {MONTH_NAMES[monthIdx]} {year}
            </span>
            <button
              onClick={() => stepPeriod(1)}
              className="p-2 rounded-xl hover:bg-white text-slate-700 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setViewMode('mensal')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                viewMode === 'mensal' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setViewMode('semanal')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                viewMode === 'semanal' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
              }`}
            >
              Semanal
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
          >
            <option value="todos">Todos os veículos</option>
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.model}
              </option>
            ))}
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
          >
            <option value="todos">Todos os clientes</option>
            {data.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
          >
            <option value="todos">Todas as situações</option>
            <option value="pendente">Previstos (Pendentes)</option>
            <option value="paga">Confirmados (Pagos)</option>
            <option value="vencida">Atrasados (Vencidos)</option>
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold px-2">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-3 h-3 rounded-full bg-amber-400" />
          Pagamento Previsto (Pendente)
        </span>
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          Pagamento Confirmado (Pago)
        </span>
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-3 h-3 rounded-full bg-rose-500" />
          Pagamento Atrasado (Vencido)
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center py-3 text-xs font-extrabold text-slate-500">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {calendarDays.map((cell) => {
            const dayInstallments = filteredInstallments.filter((i) => i.dueDate === cell.iso);
            const isToday = cell.iso === data.todayIso;

            return (
              <div
                key={cell.iso}
                className={`min-h-[110px] sm:min-h-[130px] p-1.5 sm:p-2.5 flex flex-col justify-between transition ${
                  cell.inCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      isToday ? 'bg-blue-600 text-white' : 'text-slate-700'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {dayInstallments.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 hidden sm:inline">
                      {dayInstallments.length} cobr.
                    </span>
                  )}
                </div>

                <div className="space-y-1 mt-1.5 overflow-y-auto max-h-24">
                  {dayInstallments.map((inst) => {
                    const client = data.clients.find((c) => c.id === inst.clientId);
                    const vehicle = data.vehicles.find((v) => v.id === inst.vehicleId);
                    const pillColor =
                      inst.status === 'paga'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : inst.status === 'vencida'
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100';

                    return (
                      <button
                        key={inst.id}
                        onClick={() => {
                          setSelectedInstallment(inst);
                          setPayAmountBRL((getInstallmentOpenBalanceCents(inst) / 100).toFixed(2));
                        }}
                        className={`w-full text-left px-2 py-1 rounded-lg border text-[10px] font-bold truncate transition ${pillColor}`}
                      >
                        <span className="block truncate">
                          {vehicle?.plate || ''} • {client?.fullName.split(' ')[0] || 'Cliente'}
                        </span>
                        <span>{formatCurrencyBRL(getInstallmentNetTotalCents(inst))}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal on Click Receivable (Section 6: Client, Vehicle, Value, Due Date, Status, Register Payment Button) */}
      {selectedInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-extrabold text-slate-900">
                Detalhes da Cobrança #{selectedInstallment.installmentNumber}
              </h3>
              <button
                onClick={() => setSelectedInstallment(null)}
                className="p-1.5 rounded-full text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const cli = data.clients.find((c) => c.id === selectedInstallment.clientId);
              const veh = data.vehicles.find((v) => v.id === selectedInstallment.vehicleId);
              const openCents = getInstallmentOpenBalanceCents(selectedInstallment);

              return (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cliente:</span>
                      <strong className="text-slate-900">{cli?.fullName || '—'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Veículo:</span>
                      <strong className="text-slate-900">
                        {veh ? `${veh.brand} ${veh.model} (${veh.plate})` : '—'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Data de Vencimento:</span>
                      <strong className="text-slate-900">
                        {formatBRDate(selectedInstallment.dueDate)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valor Previsto:</span>
                      <strong className="text-slate-900">
                        {formatCurrencyBRL(getInstallmentNetTotalCents(selectedInstallment))}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valor Recebido:</span>
                      <strong className="text-emerald-600">
                        {formatCurrencyBRL(selectedInstallment.paidAmountCents)}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/70">
                      <span className="text-slate-500">Status do Pagamento:</span>
                      <InstallmentStatusBadge status={selectedInstallment.status} />
                    </div>
                  </div>

                  {openCents > 0 && (
                    <form onSubmit={handleQuickReceive} className="space-y-3 pt-2">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Registrar Recebimento (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={payAmountBRL}
                          onChange={(e) => setPayAmountBRL(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-extrabold text-base text-emerald-600"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition"
                      >
                        Confirmar Recebimento
                      </button>
                    </form>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
