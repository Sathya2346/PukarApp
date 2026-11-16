import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Droplets,
  FileSpreadsheet,
  HelpCircle,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import type { AnalyticsSummary, Grievance, GrievancePriority, GrievanceStatus, Language } from '../types/portal';
import { t } from '../i18n/translations';

export function AppImage({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-amber-50 dark:from-red-950/50 dark:to-slate-900 text-red-700 dark:text-red-300 p-3 text-center ${className}`}
      >
        <Building2 className="w-7 h-7 mb-1 opacity-75" />
        <span className="text-[11px] font-medium line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function StatusBadge({ status, lang }: { status: GrievanceStatus; lang: Language }) {
  const styles: Record<GrievanceStatus, string> = {
    new: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
    assigned: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    in_progress: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    overdue: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700',
  };

  const label = t(lang, `status_${status}` as any);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md border whitespace-nowrap shrink-0 ${styles[status]}`}
    >
      {status === 'resolved' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'overdue' && <AlertTriangle className="w-3 h-3" />}
      {status === 'in_progress' && <Clock className="w-3 h-3" />}
      {label}
    </span>
  );
}

export function PriorityBadge({ priority, lang }: { priority: GrievancePriority; lang: Language }) {
  const styles: Record<GrievancePriority, string> = {
    high: 'bg-red-600 text-white',
    medium: 'bg-amber-500 text-slate-950',
    low: 'bg-emerald-600 text-white',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${styles[priority]}`}>
      {t(lang, `priority_${priority}` as any)}
    </span>
  );
}

export function CategoryIcon({ iconKey, className = 'w-6 h-6' }: { iconKey: string; className?: string }) {
  switch (iconKey) {
    case 'road':
      return <Truck className={className} />;
    case 'water':
      return <Droplets className={className} />;
    case 'electric':
      return <Zap className={className} />;
    case 'sanitation':
      return <Sparkles className={className} />;
    case 'waste':
      return <Trash2 className={className} />;
    case 'govt':
      return <Building2 className={className} />;
    case 'safety':
      return <ShieldCheck className={className} />;
    default:
      return <MoreHorizontal className={className} />;
  }
}

export function AnalyticsCharts({
  analytics,
  lang,
}: {
  analytics: AnalyticsSummary | null;
  lang: Language;
}) {
  if (!analytics) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t(lang, 'loading')}
      </div>
    );
  }

  const total = Math.max(analytics.total, 1);
  const segments = [
    { label: t(lang, 'status_resolved'), count: analytics.resolvedCount, color: '#16a34a' },
    { label: t(lang, 'status_in_progress'), count: analytics.inProgressCount, color: '#2563eb' },
    { label: t(lang, 'status_assigned'), count: analytics.assignedCount, color: '#eab308' },
    { label: t(lang, 'status_new'), count: analytics.newCount, color: '#ea580c' },
    { label: t(lang, 'status_overdue'), count: analytics.overdueCount, color: '#dc2626' },
  ];

  // Build SVG donut arc offsets
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let runningOffset = 0;

  const maxMonthly = Math.max(...analytics.monthly.map((m) => m.count), 1);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
              <circle
                cx="80"
                cy="80"
                r={60}
                fill="transparent"
                stroke="currentColor"
                className="text-slate-100 dark:text-slate-800"
                strokeWidth="16"
              />
              {segments.map((seg) => {
                const c = 2 * Math.PI * 60;
                const dash = (seg.count / total) * c;
                const offset = -runningOffset;
                runningOffset += dash;
                if (seg.count === 0) return null;
                return (
                  <circle
                    key={seg.label}
                    cx="80"
                    cy="80"
                    r={60}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={`${dash} ${c}`}
                    strokeDashoffset={offset}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-2xl font-bold font-mono-num text-slate-900 dark:text-white leading-none">
                {analytics.total}
              </span>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 max-w-[78px] mt-1 leading-tight">
                {t(lang, 'totalGrievances')}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-2.5">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: seg.color }}
                    aria-hidden="true"
                  />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{seg.label}</span>
                </div>
                <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                  {seg.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
          {t(lang, 'monthlyGrievances')}
        </h4>
        <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-40 pt-4 border-b border-slate-200 dark:border-slate-800 pb-2">
          {analytics.monthly.map((m) => {
            const pct = Math.max(10, Math.round((m.count / maxMonthly) * 100));
            return (
              <div key={m.monthKey} className="flex flex-col items-center justify-end h-full gap-1.5">
                <span className="text-xs font-mono-num font-semibold text-slate-700 dark:text-slate-300">
                  {m.count}
                </span>
                <div className="w-full max-w-[36px] bg-red-100 dark:bg-red-950/50 rounded-t-md flex items-end h-24 overflow-hidden">
                  <div
                    className="w-full bg-gradient-to-t from-red-700 to-rose-500 rounded-t-md transition-all"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate max-w-full">
                  {lang === 'ta' ? m.labelTa : m.labelEn}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function exportGrievancesToCsv(grievances: Grievance[]) {
  const headers = [
    'Grievance ID',
    'Title',
    'Category',
    'Department',
    'Location',
    'Status',
    'Priority',
    'Citizen',
    'Assigned Officer',
    'Created At',
  ];
  const escape = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const rows = grievances.map((g) =>
    [
      g.grievanceCode,
      g.title,
      g.categoryNameEn || g.categoryNameTa,
      g.departmentNameEn || g.departmentNameTa,
      g.location,
      g.status,
      g.priority,
      g.citizenName,
      g.assignedOfficerName,
      g.createdAt,
    ]
      .map(escape)
      .join(',')
  );
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `makkal-pugar-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LogoutModal({
  open,
  lang,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  lang: Language;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 text-center shadow-xl">
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center mx-auto mb-4">
          <LogOut className="w-8 h-8" />
        </div>
        <h3 id="logout-modal-title" className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          {t(lang, 'logout')}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
          {t(lang, 'logoutConfirmText')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t(lang, 'cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-red-700 text-white font-semibold text-sm hover:bg-red-800 transition-colors"
          >
            {t(lang, 'logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SourceBundleBanner({ lang }: { lang: Language }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
          {lang === 'ta'
            ? 'React Native (Expo) + Python Django + MySQL மூலக் குறியீடு'
            : 'React Native (Expo) + Python Django + MySQL Production Bundle'}
        </h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
          {lang === 'ta'
            ? 'Expo மொபைல் ஆப், Django REST API, MySQL 8.0 Schema & Docker Compose அடங்கிய ZIP தொகுப்பு.'
            : 'Complete ZIP archive with Expo mobile screens, Django REST API, MySQL 8.0 UTF8MB4 schema, and Docker Compose.'}
        </p>
      </div>
      <a
        href="/api/export-bundle"
        download="makkal-pugar-expo-django-mysql.zip"
        className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
      >
        <FileSpreadsheet className="w-4 h-4" />
        {t(lang, 'downloadBundle')}
      </a>
    </div>
  );
}

export function FaqAccordion({
  items,
}: {
  items: Array<{ q: string; a: string }>;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-2.5">
      {items.map((item, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div
            key={item.q}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              aria-expanded={isOpen}
              className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                {item.q}
              </span>
              <span className="text-slate-400 text-lg font-bold shrink-0">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
