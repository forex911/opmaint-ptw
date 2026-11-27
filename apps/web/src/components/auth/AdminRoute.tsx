import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { ProtectedRoute } from './ProtectedRoute.js';

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute>
      <AdminOnlyContent>{children}</AdminOnlyContent>
    </ProtectedRoute>
  );
};

const AdminOnlyContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div
        data-testid="admin-forbidden"
        className="p-8 md:p-12 text-center max-w-md mx-auto bg-white rounded-xl border border-[#E2E8F0] shadow-xs mt-8"
      >
        <ShieldAlert className="w-12 h-12 text-[#D97706] mx-auto mb-3" />
        <h2 className="text-base font-bold text-[#172033]">Administrator Access Required</h2>
        <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
          User, plant, area, and equipment management is restricted to System Administrators.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center mt-5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#059669] text-white hover:bg-[#047857] transition-colors"
        >
          Return to Overview
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};
