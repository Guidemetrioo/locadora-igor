import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { FleetPage } from './pages/FleetPage';
import { VehicleDetailPage } from './pages/VehicleDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { ContractsPage } from './pages/ContractsPage';
import { FinancialPage } from './pages/FinancialPage';
import { MaintenancesPage } from './pages/MaintenancesPage';
import { CalendarPage } from './pages/CalendarPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';

function AppRoutes() {
  const { token, loading } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FB]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          <span className="text-xs font-bold text-slate-500">Carregando sistema...</span>
        </div>
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/frota" element={<FleetPage />} />
        <Route path="/frota/:id" element={<VehicleDetailPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/contratos" element={<ContractsPage />} />
        <Route path="/financeiro" element={<FinancialPage />} />
        <Route path="/manutencoes" element={<MaintenancesPage />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/notificacoes" element={<NotificationsPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}

