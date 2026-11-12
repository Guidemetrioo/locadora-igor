import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Vehicle,
  MileageLog,
  MaintenancePlan,
  MaintenanceProjection,
  MaintenanceHistory,
  Client,
  Contract,
  Installment,
  Expense,
  SystemSettings,
  SystemNotification,
  AuditLog,
} from '../../shared/types';
import { handleLocalApiRequest } from '../services/localEngine';

export interface EnrichedVehicle extends Vehicle {
  calculatedDailyKmAvg: number | null;
  activeDailyKmAvg: number | null;
  projectedCurrentKm: number;
  daysSinceLastReading: number;
  projections: MaintenanceProjection[];
  activeContract: Contract | null;
  activeClient: Client | null;
}

export interface AppStateData {
  todayIso: string;
  settings: SystemSettings;
  vehicles: EnrichedVehicle[];
  mileageLogs: MileageLog[];
  maintenancePlans: MaintenancePlan[];
  maintenanceProjections: MaintenanceProjection[];
  maintenanceHistory: MaintenanceHistory[];
  clients: Client[];
  contracts: Contract[];
  installments: Installment[];
  expenses: Expense[];
  notifications: SystemNotification[];
  auditLogs: AuditLog[];
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextType {
  token: string | null;
  data: AppStateData | null;
  loading: boolean;
  toasts: ToastMessage[];
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshState: () => Promise<void>;
  apiFetch: <T = any>(path: string, options?: RequestInit) => Promise<T>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('fleet_auth_token'));
  const [data, setData] = useState<AppStateData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('fleet_auth_token');
    setToken(null);
    setData(null);
  }, []);

  const apiFetch = useCallback(
    async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      try {
        const res = await fetch(path, {
          ...options,
          headers,
        });

        const contentType = res.headers.get('content-type') || '';
        // If deployed on static/serverless host (Vercel) where /api/* returns 404, 405, 500 or HTML, use localEngine transparently
        if (!res.ok || contentType.includes('text/html') || !contentType.includes('application/json')) {
          return await handleLocalApiRequest<T>(path, options);
        }

        if (res.status === 401) {
          logout();
          throw new Error('Sessão expirada. Faça login novamente.');
        }

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Erro ao processar a solicitação.');
        }
        return json as T;
      } catch (err: any) {
        if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
          return await handleLocalApiRequest<T>(path, options);
        }
        throw err;
      }
    },
    [token, logout]
  );

  const refreshState = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch<AppStateData>('/api/state');
      setData(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('text/html') || !contentType.includes('application/json')) {
        const localRes = await handleLocalApiRequest<{ token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        localStorage.setItem('fleet_auth_token', localRes.token);
        setToken(localRes.token);
        showToast('Bem-vindo ao painel administrativo!', 'success');
        return true;
      }
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Credenciais inválidas', 'error');
        return false;
      }
      localStorage.setItem('fleet_auth_token', json.token);
      setToken(json.token);
      showToast('Bem-vindo ao painel administrativo!', 'success');
      return true;
    } catch (err: any) {
      try {
        const localRes = await handleLocalApiRequest<{ token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        localStorage.setItem('fleet_auth_token', localRes.token);
        setToken(localRes.token);
        showToast('Bem-vindo ao painel administrativo!', 'success');
        return true;
      } catch (e: any) {
        showToast(e.message || 'Credenciais inválidas.', 'error');
        return false;
      }
    }
  };

  return (
    <AppContext.Provider
      value={{
        token,
        data,
        loading,
        toasts,
        showToast,
        login,
        logout,
        refreshState,
        apiFetch,
      }}
    >
      {children}
      {/* Toast Notification Stack */}
      <div className="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 md:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
              t.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : t.type === 'info'
                ? 'bg-slate-800 text-white border-slate-700'
                : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider');
  return ctx;
}

