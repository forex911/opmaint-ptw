import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { Shell } from '../layout/Shell.js';
import { Shield } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F7FA]">
        <div className="p-3 rounded-xl bg-[#14243A] text-white shadow-md animate-pulse mb-3">
          <Shield className="w-8 h-8 text-[#2563EB]" />
        </div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Verifying Certified Session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Shell>{children}</Shell>;
};
