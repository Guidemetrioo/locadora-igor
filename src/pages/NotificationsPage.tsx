import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  AlertTriangle,
  Clock,
  Wrench,
  DollarSign,
  FileText,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export function NotificationsPage() {
  const { data } = useApp();
  const navigate = useNavigate();

  if (!data) return null;

  const notifications = data.notifications;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Central de Notificações e Alertas</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Alertas automáticos de pagamentos próximos/vencidos, manutenções preventivas e contratos próximos do encerramento.
          </p>
        </div>

        <button
          onClick={() => navigate('/configuracoes')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
        >
          <Settings className="w-4 h-4" />
          Configurar Antecedência dos Alertas
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Tudo em dia!</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            Não há pagamentos atrasados, manutenções vencidas ou alertas pendentes no momento. Você pode personalizar quantos dias ou quilômetros antes deseja ser avisado em Configurações.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isDanger = n.severity === 'danger';
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (n.type.startsWith('pagamento')) navigate('/financeiro');
                  else if (n.type.startsWith('manutencao')) navigate('/manutencoes');
                  else navigate('/contratos');
                }}
                className={`p-5 rounded-3xl border flex items-center justify-between gap-4 cursor-pointer transition ${
                  isDanger
                    ? 'bg-rose-50/70 border-rose-200 hover:bg-rose-50'
                    : 'bg-amber-50/70 border-amber-200 hover:bg-amber-50'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      isDanger ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                    }`}
                  >
                    {n.type.startsWith('manutencao') ? (
                      <Wrench className="w-5 h-5" />
                    ) : n.type.startsWith('pagamento') ? (
                      <DollarSign className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4
                      className={`text-sm font-extrabold ${
                        isDanger ? 'text-rose-900' : 'text-amber-900'
                      }`}
                    >
                      {n.title}
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                    isDanger ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                  }`}
                >
                  Resolver →
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

