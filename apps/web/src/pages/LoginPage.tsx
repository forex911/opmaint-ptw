import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, KeyRound, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already logged in, redirect to dashboard
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await login({ email, password });
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('PtwPass2026!');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#F5F7FA] px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-xl bg-[#0E231D] text-white shadow-md mb-3">
            <Shield className="w-8 h-8 text-[#059669]" />
          </div>
          <h1 className="text-2xl font-bold text-[#172033] tracking-tight">OPMAINT CMMS</h1>
          <p className="text-xs font-semibold text-[#64748B] tracking-wider uppercase mt-1">
            Permit to Work Safety System
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8">
          <h2 className="text-lg font-bold text-[#172033] mb-1">Sign in to your account</h2>
          <p className="text-xs text-[#64748B] mb-6">
            Enter your certified credentials to access industrial work permits.
          </p>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work Email"
              type="email"
              required
              placeholder="e.g. requester@cmms.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />

            <div>
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2 font-semibold"
              isLoading={isLoading}
            >
              <KeyRound className="w-4 h-4" />
              <span>Sign In</span>
            </Button>
          </form>

          {/* Reviewer Demo Credentials Helper (Dev / Review Mode only) */}
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true') && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-3">
                <UserCheck className="w-4 h-4 text-[#059669]" />
                <span>Reviewer Quick Demo Accounts (Click to Fill):</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => fillDemo('requester@cmms.local')}
                  className="p-2 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="block font-semibold text-slate-800">Requester</span>
                  <span className="block text-[11px] text-slate-500 font-mono">requester@cmms.local</span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('area.owner@cmms.local')}
                  className="p-2 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="block font-semibold text-slate-800">Area Owner</span>
                  <span className="block text-[11px] text-slate-500 font-mono">area.owner@cmms.local</span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('safety.officer@cmms.local')}
                  className="p-2 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="block font-semibold text-slate-800">Safety Officer</span>
                  <span className="block text-[11px] text-slate-500 font-mono">safety.officer@cmms.local</span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('admin@cmms.local')}
                  className="p-2 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="block font-semibold text-slate-800">System Admin</span>
                  <span className="block text-[11px] text-slate-500 font-mono">admin@cmms.local</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Password for all seeded reviewer accounts: <code className="font-mono text-slate-600">PtwPass2026!</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
