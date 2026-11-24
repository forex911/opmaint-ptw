import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  plannedEnd: string | Date;
  status: string;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ plannedEnd, status }) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
    isOverdue: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, isOverdue: false });

  useEffect(() => {
    const target = new Date(plannedEnd).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, isOverdue: true });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds, totalMs: diff, isOverdue: false });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [plannedEnd]);

  if (status === 'EXPIRED' || timeLeft.isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
        <AlertTriangle className="w-3.5 h-3.5" />
        EXPIRED
      </span>
    );
  }

  // Under 30 minutes: Critical Red Alert
  if (timeLeft.totalMs < 30 * 60 * 1000) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-300 animate-pulse">
        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
        {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:
        {String(timeLeft.seconds).padStart(2, '0')}
      </span>
    );
  }

  // Under 2 hours: Urgent Amber Warning
  if (timeLeft.totalMs < 2 * 60 * 60 * 1000) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
        <Clock className="w-3.5 h-3.5 text-amber-600" />
        {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:
        {String(timeLeft.seconds).padStart(2, '0')}
      </span>
    );
  }

  // Normal window: Crisp Slate
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
      <Clock className="w-3.5 h-3.5 text-slate-500" />
      {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:
      {String(timeLeft.seconds).padStart(2, '0')}
    </span>
  );
};
