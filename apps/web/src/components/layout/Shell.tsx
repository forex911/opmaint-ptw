import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Clock,
  PlusCircle,
  Database,
  LogOut,
  User,
  Shield,
  Menu,
  X,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Button } from '../ui/Button.js';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, isRequester, isAdmin, isAreaOwner, isSafetyOfficer } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    {
      label: 'Overview',
      path: '/',
      icon: <LayoutDashboard className="w-4 h-4" />,
      visible: true,
    },
    {
      label: 'Permits',
      path: '/permits',
      icon: <FileText className="w-4 h-4" />,
      visible: true,
    },
    {
      label: 'My Requests',
      path: '/permits?mine=true',
      icon: <CheckSquare className="w-4 h-4" />,
      visible: true,
    },
    {
      label: 'Pending Approvals',
      path: '/permits?pendingMyApproval=true',
      icon: <Clock className="w-4 h-4" />,
      visible: isAreaOwner || isSafetyOfficer || isAdmin,
    },
    {
      label: 'Reference Data',
      path: '/reference',
      icon: <Database className="w-4 h-4" />,
      visible: isAdmin,
    },
  ];

  const roleBadgeStyles: Record<string, string> = {
    REQUESTER: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    AREA_OWNER: 'bg-blue-950 text-blue-300 border-blue-800',
    SAFETY_OFFICER: 'bg-amber-950 text-amber-300 border-amber-800',
    ADMIN: 'bg-purple-950 text-purple-300 border-purple-800',
  };

  return (
    <div className="h-screen w-full flex bg-[#F5F7FA] overflow-hidden">
      {/* Sidebar Desktop - Fixed in place, never scrolls with the page */}
      <aside className="hidden md:flex flex-col w-64 h-screen bg-[#0E231D] text-white shrink-0 border-r border-[#183A30]">
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-[#183A30] gap-3 shrink-0">
          <div className="p-2 rounded-lg bg-[#059669] text-white shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-base">OPMAINT</span>
            <span className="block text-[10px] tracking-wider text-emerald-200/60 font-semibold uppercase">
              Permit to Work
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const active =
                item.path === '/'
                  ? location.pathname === '/' && !location.search
                  : location.pathname + location.search === item.path ||
                    (item.path === '/permits' &&
                      location.pathname === '/permits' &&
                      !location.search);

              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#059669] text-white shadow-sm'
                      : 'text-emerald-100/70 hover:text-white hover:bg-[#183A30]/60'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-[#183A30] bg-[#081712] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#183A30] flex items-center justify-center text-emerald-200 text-xs font-bold shrink-0">
                {user?.name ? user.name[0]?.toUpperCase() : 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                <span
                  className={`inline-block text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                    roleBadgeStyles[user?.role || ''] || 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {user?.role}
                </span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-[#183A30] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex flex-col w-64 bg-[#0E231D] text-white p-4 border-r border-[#183A30]">
            <div className="flex items-center justify-between pb-4 border-b border-[#183A30]">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#059669]" />
                <span className="font-bold text-white">OPMAINT PTW</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems
                .filter((item) => item.visible)
                .map((item) => (
                  <Link
                    key={item.label}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-emerald-100/70 hover:text-white hover:bg-[#183A30]"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
            </nav>
            <div className="pt-4 border-t border-[#183A30] flex items-center justify-between">
              <div className="text-xs">
                <p className="font-semibold text-white">{user?.name}</p>
                <p className="text-emerald-300/80">{user?.role}</p>
              </div>
              <button
                onClick={() => logout()}
                className="text-slate-400 hover:text-rose-400 p-1.5"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container - Only this scrolls */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-[#E2E8F0] px-4 md:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <span className="font-medium">Opmaint CMMS</span>
              <span>/</span>
              <span className="text-[#172033] font-semibold">Permit to Work</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(isRequester || isAdmin) && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => navigate('/permits/new')}
                className="gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Permit</span>
              </Button>
            )}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
              <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 text-xs font-bold">
                <User className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-[#172033]">{user?.name}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto pb-16 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
};
