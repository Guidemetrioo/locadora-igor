import React from 'react';

export const DEFAULT_CAR_SILHOUETTES: Record<string, string> = {
  Branco: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 110" fill="none"><rect width="240" height="110" rx="16" fill="%23F8FAFC"/><path d="M36 74L48 44C52 36 60 32 70 32H150C162 32 172 37 180 46L202 54C208 56 212 62 212 68V76C212 80 208 84 204 84H36C31 84 28 80 28 75C28 74.5 31 74 36 74Z" fill="%23E2E8F0" stroke="%23475569" stroke-width="3"/><path d="M68 37H112V54H54L64 39C65 37.8 66.5 37 68 37Z" fill="%23334155"/><path d="M118 37H152C158 37 164 40 168 45L175 54H118V37Z" fill="%23334155"/><circle cx="68" cy="82" r="16" fill="%231E293B"/><circle cx="68" cy="82" r="8" fill="%2394A3B8"/><circle cx="174" cy="82" r="16" fill="%231E293B"/><circle cx="174" cy="82" r="8" fill="%2394A3B8"/></svg>`,
  Preto: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 110" fill="none"><rect width="240" height="110" rx="16" fill="%23F8FAFC"/><path d="M36 74L48 44C52 36 60 32 70 32H150C162 32 172 37 180 46L202 54C208 56 212 62 212 68V76C212 80 208 84 204 84H36C31 84 28 80 28 75C28 74.5 31 74 36 74Z" fill="%231E293B" stroke="%230F172A" stroke-width="3"/><path d="M68 37H112V54H54L64 39C65 37.8 66.5 37 68 37Z" fill="%23475569"/><path d="M118 37H152C158 37 164 40 168 45L175 54H118V37Z" fill="%23475569"/><circle cx="68" cy="82" r="16" fill="%230F172A"/><circle cx="68" cy="82" r="8" fill="%23CBD5E1"/><circle cx="174" cy="82" r="16" fill="%230F172A"/><circle cx="174" cy="82" r="8" fill="%23CBD5E1"/></svg>`,
  Prata: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 110" fill="none"><rect width="240" height="110" rx="16" fill="%23F8FAFC"/><path d="M36 74L48 44C52 36 60 32 70 32H150C162 32 172 37 180 46L202 54C208 56 212 62 212 68V76C212 80 208 84 204 84H36C31 84 28 80 28 75C28 74.5 31 74 36 74Z" fill="%2394A3B8" stroke="%23334155" stroke-width="3"/><path d="M68 37H112V54H54L64 39C65 37.8 66.5 37 68 37Z" fill="%231E293B"/><path d="M118 37H152C158 37 164 40 168 45L175 54H118V37Z" fill="%231E293B"/><circle cx="68" cy="82" r="16" fill="%230F172A"/><circle cx="68" cy="82" r="8" fill="%23E2E8F0"/><circle cx="174" cy="82" r="16" fill="%230F172A"/><circle cx="174" cy="82" r="8" fill="%23E2E8F0"/></svg>`,
  Azul: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 110" fill="none"><rect width="240" height="110" rx="16" fill="%23F8FAFC"/><path d="M36 74L48 44C52 36 60 32 70 32H150C162 32 172 37 180 46L202 54C208 56 212 62 212 68V76C212 80 208 84 204 84H36C31 84 28 80 28 75C28 74.5 31 74 36 74Z" fill="%232563EB" stroke="%231E40AF" stroke-width="3"/><path d="M68 37H112V54H54L64 39C65 37.8 66.5 37 68 37Z" fill="%23DBEAFE"/><path d="M118 37H152C158 37 164 40 168 45L175 54H118V37Z" fill="%23DBEAFE"/><circle cx="68" cy="82" r="16" fill="%230F172A"/><circle cx="68" cy="82" r="8" fill="%23E2E8F0"/><circle cx="174" cy="82" r="16" fill="%230F172A"/><circle cx="174" cy="82" r="8" fill="%23E2E8F0"/></svg>`,
  Vermelho: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 110" fill="none"><rect width="240" height="110" rx="16" fill="%23F8FAFC"/><path d="M36 74L48 44C52 36 60 32 70 32H150C162 32 172 37 180 46L202 54C208 56 212 62 212 68V76C212 80 208 84 204 84H36C31 84 28 80 28 75C28 74.5 31 74 36 74Z" fill="%23DC2626" stroke="%23991B1B" stroke-width="3"/><path d="M68 37H112V54H54L64 39C65 37.8 66.5 37 68 37Z" fill="%23FEE2E2"/><path d="M118 37H152C158 37 164 40 168 45L175 54H118V37Z" fill="%23FEE2E2"/><circle cx="68" cy="82" r="16" fill="%230F172A"/><circle cx="68" cy="82" r="8" fill="%23E2E8F0"/><circle cx="174" cy="82" r="16" fill="%230F172A"/><circle cx="174" cy="82" r="8" fill="%23E2E8F0"/></svg>`,
};

export function getVehicleThumb(photoUrl?: string, color?: string): string {
  if (photoUrl && photoUrl.trim().length > 0) return photoUrl;
  const normalized = (color || '').toLowerCase();
  if (normalized.includes('pret')) return DEFAULT_CAR_SILHOUETTES.Preto;
  if (normalized.includes('prat') || normalized.includes('cinz')) return DEFAULT_CAR_SILHOUETTES.Prata;
  if (normalized.includes('azul')) return DEFAULT_CAR_SILHOUETTES.Azul;
  if (normalized.includes('verm')) return DEFAULT_CAR_SILHOUETTES.Vermelho;
  return DEFAULT_CAR_SILHOUETTES.Branco;
}

export function VehicleStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    disponivel: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    alugado: 'bg-blue-50 text-blue-700 border-blue-200',
    manutencao: 'bg-amber-50 text-amber-700 border-amber-200',
    inativo: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const labels: Record<string, string> = {
    disponivel: 'Disponível',
    alugado: 'Alugado',
    manutencao: 'Em Manutenção',
    inativo: 'Inativo',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.inativo}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        status === 'disponivel' ? 'bg-emerald-500' :
        status === 'alugado' ? 'bg-blue-500' :
        status === 'manutencao' ? 'bg-amber-500' : 'bg-slate-400'
      }`} />
      {labels[status] || status}
    </span>
  );
}

export function MaintenanceStatePill({ status }: { status: string }) {
  // Inspired by FleetMax teal/cyan/amber/red rounded pills
  if (status === 'em_dia') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#0284c7] text-white shadow-sm">
        Em dia
      </span>
    );
  }
  if (status === 'proxima') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-sm">
        Próxima
      </span>
    );
  }
  if (status === 'vencida') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-600 text-white shadow-sm">
        Vencida
      </span>
    );
  }
  if (status === 'executada') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#14b8a6] text-white shadow-sm">
        Executada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
      Previsão indisponível
    </span>
  );
}

export function InstallmentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    paga: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Paga' },
    parcialmente_paga: { bg: 'bg-cyan-50 text-cyan-700 border-cyan-200', label: 'Parcialmente Paga' },
    pendente: { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pendente' },
    vencida: { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Vencida' },
    cancelada: { bg: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Cancelada' },
  };
  const item = map[status] || map.pendente;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${item.bg}`}>
      {item.label}
    </span>
  );
}

