import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { Shell } from '../layout/Shell.js';
import { Logo } from '../ui/Logo.js';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#06140F] via-[#0A1F17] to-[#040C09] text-white px-4 relative overflow-hidden">
        {/* Subtle radial background decorative circles */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[500px] h-[500px] rounded-full border border-emerald-500/20" />
          <div className="absolute w-[340px] h-[340px] rounded-full border border-emerald-500/30" />
          <div className="absolute w-[200px] h-[200px] rounded-full border border-emerald-500/40" />
        </div>

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-5">
          {/* Brand Logo with glowing emerald aura */}
          <div className="relative">
            <div className="absolute -inset-2.5 rounded-2xl bg-emerald-500/25 blur-lg animate-pulse" />
            <div className="relative p-1 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 shadow-2xl">
              <Logo size="xl" className="w-14 h-14 rounded-xl" />
            </div>
          </div>

          {/* Brand Text */}
          <div className="space-y-1">
            <h1 className="text-xl font-extrabold text-white tracking-tight">OPMAINT</h1>
            <p className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
              Permit to Work Safety System
            </p>
          </div>

          {/* Session Verification Status Pill */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-950/70 border border-emerald-500/30 shadow-inner">
            <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs font-semibold text-emerald-200 tracking-wide">
              Verifying Certified Session...
            </span>
          </div>

          {/* Regulatory Compliance Badge */}
          <div className="pt-4 border-t border-emerald-900/30 w-full max-w-[220px]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/40">
              OSHA 1910 &bull; ISO 45001 COMPLIANT
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Shell>{children}</Shell>;
};
