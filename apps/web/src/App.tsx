import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext.js';
import { ProtectedRoute } from './components/auth/ProtectedRoute.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PermitsListPage } from './pages/PermitsListPage.js';
import { CreatePermitPage } from './pages/CreatePermitPage.js';
import { PermitDetailPage } from './pages/PermitDetailPage.js';
import { ReferenceDataPage } from './pages/ReferenceDataPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              {/* Public Auth Route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Application Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/permits"
                element={
                  <ProtectedRoute>
                    <PermitsListPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/permits/new"
                element={
                  <ProtectedRoute>
                    <CreatePermitPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/permits/:id"
                element={
                  <ProtectedRoute>
                    <PermitsDetailPageWrapper />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reference"
                element={
                  <ProtectedRoute>
                    <ReferenceDataPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

// Wrapper for clean component loading
const PermitsDetailPageWrapper: React.FC = () => {
  return <PermitDetailPage />;
};
