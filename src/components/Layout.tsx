import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Car,
  Users,
  FileText,
  DollarSign,
  Wrench,
  Calendar,
  Bell,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const { data, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const notifCount = data?.notifications.length || 0;
  const companyName = data?.settings.companyName || 'Car Rental';
  const adminName = data?.settings.adminName || 'Administrador';
  const adminRole = data?.settings.adminRole || 'Admin';

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/frota', label: 'Minha Frota', icon: Car },
    { to: '/clientes', label: 'Clientes', icon: Users },
    { to: '/contratos', label: 'Contratos', icon: FileText },
    { to: '/financeiro', label: 'Financeiro', icon: DollarSign },
    { to: '/manutencoes', label: 'Manutenções', icon: Wrench },
    { to: '/calendario', label: 'Calendário', icon: Calendar },
    { to: '/notificacoes', label: 'Notificações', icon: Bell, badge: notifCount },
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ];

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    const q = globalSearch.toLowerCase();
    // Match vehicle plate or model first
    const matchedVehicle = data?.vehicles.find(
      (v) => v.plate.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || v.brand.toLowerCase().includes(q)
    );
    if (matchedVehicle) {
      navigate(`/frota/${matchedVehicle.id}`);
      setGlobalSearch('');
      return;
    }
    const matchedClient = data?.clients.find(
      (c) => c.fullName.toLowerCase().includes(q) || c.document.toLowerCase().includes(q)
    );
    if (matchedClient) {
      navigate('/clientes');
      setGlobalSearch('');
      return;
    }
    navigate('/frota');
  };

  return (
    <div className="min-h-screen flex bg-[#F5F7FB] text-slate-800">
      {/* Desktop Left Sidebar (Inspired by Image 2 - Car Rental SaaS) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-100 fixed inset-y-0 left-0 z-30 justify-between">
        <div>
          {/* Brand Header */}
          <div className="h-20 px-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md shadow-blue-600/20">
              C
            </div>
            <div className="truncate">
              <span className="font-bold text-lg text-blue-600 tracking-tight block leading-tight truncate">
                {companyName}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Gestão de Frota</span>
            </div>
          </div>

          {/* Menu Items (Exact order from Section 13) */}
          <nav className="px-3 py-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `group flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all relative ${
                      isActive
                        ? 'bg-blue-50/90 text-blue-600 font-semibold'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
                      )}
                      <div className="flex items-center gap-3.5">
                        <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-bold rounded-full bg-rose-500 text-white shadow-sm">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Profile & Logout (Inspired by Image 2) */}
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                {adminName.slice(0, 2).toUpperCase()}
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white absolute bottom-0 right-0" />
            </div>
            <div className="truncate">
              <p className="text-[11px] text-slate-400 font-medium leading-none">{adminRole}</p>
              <p className="text-sm font-bold text-slate-800 truncate mt-0.5">{adminName}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do sistema</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] bg-white h-full shadow-2xl flex flex-col justify-between z-10 p-4">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold">
                    C
                  </div>
                  <span className="font-bold text-blue-600 text-base truncate">{companyName}</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium ${
                          isActive
                            ? 'bg-blue-50 text-blue-600 font-semibold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500 text-white">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-20 lg:pb-8">
        {/* Top Bar (Inspired by Image 2: Greeting + Pill Search Bar + Bell + User Avatar) */}
        <header className="sticky top-0 z-20 bg-[#F5F7FB]/90 backdrop-blur-md px-4 sm:px-8 py-4 flex items-center justify-between gap-4 border-b border-slate-200/60 lg:border-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white text-slate-700 shadow-xs border border-slate-200/80"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Olá, {adminName.split(' ')[0]}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Painel centralizado de controle operacional e financeiro
              </p>
            </div>
          </div>

          {/* Center Search Bar */}
          <form onSubmit={handleGlobalSearchSubmit} className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Buscar veículo por placa, modelo ou cliente..."
                className="w-full pl-11 pr-10 py-2.5 bg-white rounded-full text-sm text-slate-700 placeholder-slate-400 shadow-xs border border-slate-200/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <SlidersHorizontal className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </form>

          {/* Right Notification Bell & Profile */}
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              onClick={() => navigate('/notificacoes')}
              className="relative p-2.5 rounded-full bg-white text-slate-600 hover:text-blue-600 shadow-xs border border-slate-200/70 transition"
              title="Central de Alertas e Notificações"
            >
              <Bell className="w-5 h-5" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {notifCount}
                </span>
              )}
            </button>

            <div
              onClick={() => navigate('/configuracoes')}
              className="hidden sm:flex items-center gap-2.5 cursor-pointer bg-white pl-2 pr-3.5 py-1.5 rounded-full shadow-xs border border-slate-200/70 hover:border-blue-200 transition"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center">
                {adminName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-[10px] text-slate-400 font-medium leading-none">{adminRole}</p>
                <p className="text-xs font-bold text-slate-800 leading-tight mt-0.5">{adminName}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 px-4 sm:px-8 pt-2 pb-10 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar for Fast Thumb Access */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 flex items-center justify-around py-1.5 px-1 shadow-lg">
        {[
          { to: '/', label: 'Início', icon: LayoutDashboard },
          { to: '/frota', label: 'Frota', icon: Car },
          { to: '/manutencoes', label: 'Manutenção', icon: Wrench },
          { to: '/financeiro', label: 'Financeiro', icon: DollarSign },
          { to: '/calendario', label: 'Calendário', icon: Calendar },
        ].map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[11px] font-medium transition ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

