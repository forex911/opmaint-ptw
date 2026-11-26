import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  UserCheck,
  Activity,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#081712] overflow-x-hidden selection:bg-emerald-500 selection:text-white font-sans">

      {/* ===================================================================== */}
      {/* LEFT COLUMN: Full-Bleed Dark Forest Hero, Mockup & Sonar Rings        */}
      {/* ===================================================================== */}
      <div className="w-full lg:w-[52%] xl:w-[55%] min-h-[580px] lg:min-h-screen lg:h-screen p-8 sm:p-12 lg:p-14 xl:p-16 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#0B1E17] via-[#0E231D] to-[#06140F] shrink-0">

        {/* Background Concentric Radar Rings */}
        <div className="absolute -left-20 -bottom-20 w-[680px] h-[680px] pointer-events-none opacity-20">
          <div className="absolute inset-0 rounded-full border border-emerald-400" />
          <div className="absolute inset-16 rounded-full border border-emerald-400" />
          <div className="absolute inset-32 rounded-full border border-emerald-400" />
          <div className="absolute inset-48 rounded-full border border-emerald-400" />
          <div className="absolute inset-64 rounded-full border border-emerald-400" />
        </div>

        {/* Subtle Ambient Radial Glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Tagline */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-600/40 text-xs font-semibold text-emerald-300 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Certified Industrial Safety Platform</span>
          </div>
          <p className="text-xs sm:text-sm text-emerald-200/70 mt-3 font-medium tracking-wide">
            Global safety made simple — certified Permit to Work compliance for you.
          </p>
        </div>

        {/* Main Hero Headline & Live Terminal Mockup */}
        <div className="relative z-10 my-auto py-6 sm:py-8">
          <h1 className="text-4xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight text-white leading-[1.08] mb-8">
            Control <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200">
              your permits
            </span>
          </h1>

          {/* Handheld Industrial Terminal Mockup */}
          <div className="relative max-w-[340px] rounded-[2.5rem] bg-slate-900/90 p-3 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
            <div className="bg-[#091712] rounded-[2.1rem] p-4 border border-emerald-500/25 overflow-hidden">

              {/* Device Header */}
              <div className="flex items-center justify-between pb-3 border-b border-emerald-800/40 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="font-bold text-white tracking-wider text-[11px]">PTW LIVE</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-700/60 font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              </div>

              {/* Metric Card inside Mockup */}
              <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/90 to-slate-900 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-semibold text-emerald-400/80 tracking-wider block">
                  Active Permits In Progress
                </span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-2xl font-bold font-mono text-white tracking-tight">11 Live</span>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                    100% Green
                  </span>
                </div>

                {/* Live Telemetry Indicator Bars */}
                <div className="grid grid-cols-6 gap-1.5 items-end h-9 mt-3 pt-2 border-t border-emerald-800/30">
                  <div className="bg-emerald-500/40 rounded-t h-[40%]" />
                  <div className="bg-emerald-500/60 rounded-t h-[65%]" />
                  <div className="bg-emerald-500/80 rounded-t h-[85%]" />
                  <div className="bg-emerald-400 rounded-t h-[100%]" />
                  <div className="bg-emerald-500/70 rounded-t h-[60%]" />
                  <div className="bg-emerald-500/50 rounded-t h-[75%]" />
                </div>
              </div>

              {/* Live Permits Mini Cards */}
              <div className="space-y-1.5">
                <div className="bg-emerald-950/50 p-2.5 rounded-xl border border-emerald-600/30 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white">PTW-2026-0019</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 font-bold border border-emerald-600/40">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-emerald-100/70 truncate text-[10px] mt-0.5">
                    Boiler Flare Header Hot Work
                  </p>
                </div>

                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-300">PTW-2026-0018</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 font-bold border border-amber-600/40">
                      PENDING
                    </span>
                  </div>
                  <p className="text-slate-400 truncate text-[10px] mt-0.5">
                    Nitrogen Reactor Vessel Entry
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Left Footer Badges */}
        <div className="relative z-10 flex items-center gap-4 text-xs text-emerald-300/60 font-medium">
          <span>© 2026 OPMAINT CMMS Inc.</span>
          <span>•</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            OSHA 1910 & ISO 45001 Compliant
          </span>
        </div>

      </div>

      {/* ===================================================================== */}
      {/* RIGHT COLUMN: Full-Height Clean White Form Section                    */}
      {/* ===================================================================== */}
      <div className="w-full lg:w-[48%] xl:w-[45%] min-h-screen lg:h-screen bg-white rounded-t-[2.5rem] lg:rounded-t-none lg:rounded-l-[3.5rem] shadow-[-25px_0_60px_rgba(0,0,0,0.35)] flex flex-col justify-between p-8 sm:p-12 lg:p-14 xl:p-16 overflow-y-auto z-10 relative">

        {/* Top Header: Brand Logo & Portal Status */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#0E231D] text-white shadow-md">
              <Shield className="w-6 h-6 text-[#059669]" />
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-slate-900 text-base sm:text-lg block">
                OPMAINT CMMS
              </span>
              <span className="block text-[10px] tracking-wider text-slate-400 font-semibold uppercase">
                Permit to Work Safety System
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Certified Access</span>
          </div>
        </div>

        {/* Center Form Section */}
        <div className="my-auto py-4">
          <div className="mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">
              Enter your certified credentials to access industrial work permits.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs sm:text-sm text-rose-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Work Email Field */}
            <div>
              <label
                htmlFor="work-email"
                className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider"
              >
                Work Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="work-email"
                  type="email"
                  required
                  placeholder="e.g. requester@cmms.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-3.5 text-sm font-medium text-slate-900 bg-slate-50/70 border border-slate-200 rounded-2xl transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-[#059669] disabled:bg-slate-100"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider"
              >
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full pl-11 pr-12 py-3.5 text-sm font-medium text-slate-900 bg-slate-50/70 border border-slate-200 rounded-2xl transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-[#059669] disabled:bg-slate-100 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end pt-1">
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  fillDemo('requester@cmms.local');
                }}
                className="text-xs font-semibold text-[#059669] hover:underline"
              >
                Forgot password?
              </a>
            </div>

            {/* Modern Rounded Gradient Pill Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-4 px-6 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 select-none cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* Reviewer Quick Demo Credentials Helper */}
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true') && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-3">
                <UserCheck className="w-4 h-4 text-[#059669]" />
                <span>Reviewer Quick Demo Accounts (Click to Fill):</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => fillDemo('requester@cmms.local')}
                  className="p-3 text-left rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-300 transition-colors group cursor-pointer"
                >
                  <span className="block font-bold text-slate-800 group-hover:text-emerald-950">Requester</span>
                  <span className="block text-[11px] text-slate-500 font-mono truncate">
                    requester@cmms.local
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('area.owner@cmms.local')}
                  className="p-3 text-left rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-300 transition-colors group cursor-pointer"
                >
                  <span className="block font-bold text-slate-800 group-hover:text-emerald-950">Area Owner</span>
                  <span className="block text-[11px] text-slate-500 font-mono truncate">
                    area.owner@cmms.local
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('safety.officer@cmms.local')}
                  className="p-3 text-left rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-300 transition-colors group cursor-pointer"
                >
                  <span className="block font-bold text-slate-800 group-hover:text-emerald-950">Safety Officer</span>
                  <span className="block text-[11px] text-slate-500 font-mono truncate">
                    safety.officer@cmms.local
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('admin@cmms.local')}
                  className="p-3 text-left rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-300 transition-colors group cursor-pointer"
                >
                  <span className="block font-bold text-slate-800 group-hover:text-emerald-950">System Admin</span>
                  <span className="block text-[11px] text-slate-500 font-mono truncate">
                    admin@cmms.local
                  </span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400 mt-3 text-center">
                Password for all seeded reviewer accounts: <code className="font-mono text-slate-600 font-bold">PtwPass2026!</code>
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
