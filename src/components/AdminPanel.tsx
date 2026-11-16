import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  FileSpreadsheet,
  FolderPlus,
  Layers,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Shield,
  Star,
  Sun,
  ThumbsUp,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  ActivityLog,
  AnalyticsSummary,
  Category,
  Department,
  Grievance,
  Language,
  SystemSettings,
  UserProfile,
} from '../types/portal';
import { t } from '../i18n/translations';
import { api } from '../services/api';
import { validateOfficerForm } from '../utils/grievanceLogic';
import {
  AnalyticsCharts,
  CategoryIcon,
  exportGrievancesToCsv,
  SourceBundleBanner,
  StatusBadge,
} from './CommonUI';

export type AdminView =
  | 'home'
  | 'monitoring'
  | 'assign_grievance'
  | 'officer_mgmt'
  | 'create_officer'
  | 'officer_list'
  | 'officer_detail'
  | 'approvals'
  | 'departments'
  | 'user_mgmt'
  | 'user_list'
  | 'blocked_users'
  | 'categories'
  | 'reports'
  | 'analytics'
  | 'settings'
  | 'logs';

export function AdminPanel({
  view,
  onNavigate,
  lang,
  onToggleLang,
  darkMode,
  onToggleDarkMode,
  user,
  grievances,
  officers,
  citizens,
  pendingApprovals,
  departments,
  categories,
  logs,
  settings,
  analytics,
  onRefreshData,
}: {
  view: AdminView;
  onNavigate: (v: AdminView) => void;
  lang: Language;
  onToggleLang: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: UserProfile;
  grievances: Grievance[];
  officers: UserProfile[];
  citizens: UserProfile[];
  pendingApprovals: UserProfile[];
  departments: Department[];
  categories: Category[];
  logs: ActivityLog[];
  settings: SystemSettings;
  analytics: AnalyticsSummary | null;
  onRefreshData: () => Promise<void>;
}) {
  const [monitorTab, setMonitorTab] = useState<'all' | 'pending'>('all');
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(grievances[0] || null);
  const [selectedOfficer, setSelectedOfficer] = useState<UserProfile | null>(officers[0] || null);
  const [approvalTab, setApprovalTab] = useState<'officer' | 'citizen'>('officer');
  const [officerSearch, setOfficerSearch] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'OFFICER_CREATED' | 'GRIEVANCE_ASSIGNED' | 'LOGIN'>('all');

  // Assign grievance form
  const [assignOfficerId, setAssignOfficerId] = useState<number>(officers[0]?.id || 0);
  const [assignNote, setAssignNote] = useState('');

  // Create officer form
  const [offName, setOffName] = useState('');
  const [offPhone, setOffPhone] = useState('');
  const [offEmail, setOffEmail] = useState('');
  const [offDesig, setOffDesig] = useState('உதவி பொறியாளர் (Assistant Engineer)');
  const [offDeptId, setOffDeptId] = useState<number>(departments[0]?.id || 1);
  const [offSubRole, setOffSubRole] = useState<'officer' | 'field_worker'>('officer');
  const [offLocation, setOffLocation] = useState('');
  const [offError, setOffError] = useState('');

  // New department / category form
  const [newDeptTa, setNewDeptTa] = useState('');
  const [newDeptEn, setNewDeptEn] = useState('');
  const [newCatTa, setNewCatTa] = useState('');
  const [newCatEn, setNewCatEn] = useState('');

  // System settings local state
  const [prefixInput, setPrefixInput] = useState(settings.grievancePrefix);
  const [otpMinInput, setOtpMinInput] = useState(String(settings.otpExpiryMinutes));
  const [allowReg, setAllowReg] = useState(settings.allowUserRegistration);
  const [pushOn, setPushOn] = useState(settings.pushNotificationsEnabled);
  const [autoAssign, setAutoAssign] = useState(settings.autoAssignByDepartment);

  const [feedbackBanner, setFeedbackBanner] = useState('');
  const [busy, setBusy] = useState(false);

  const activeGrievance = useMemo(() => {
    if (selectedGrievance) {
      return grievances.find((g) => g.id === selectedGrievance.id) || selectedGrievance;
    }
    return grievances[0] || null;
  }, [grievances, selectedGrievance]);

  const activeOfficer = useMemo(() => {
    if (selectedOfficer) {
      return officers.find((o) => o.id === selectedOfficer.id) || selectedOfficer;
    }
    return officers[0] || null;
  }, [officers, selectedOfficer]);

  const kpis = useMemo(() => {
    const total = grievances.length;
    const inProg = grievances.filter((g) => g.status === 'in_progress' || g.status === 'assigned').length;
    const resolved = grievances.filter((g) => g.status === 'resolved').length;
    const pending = grievances.filter((g) => g.status === 'new' || g.status === 'overdue').length;
    return { total, inProg, resolved, pending };
  }, [grievances]);

  const handleCreateOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    setOffError('');
    const check = validateOfficerForm({
      fullName: offName,
      email: offEmail,
      phone: offPhone,
      designation: offDesig,
      departmentId: offDeptId,
      location: offLocation,
    });
    if (!check.valid) {
      setOffError(
        lang === 'ta'
          ? 'முழு பெயர், சரியான மின்னஞ்சல், 10 இலக்க மொபைல் எண் மற்றும் பணியிடம் தேவை.'
          : 'Please enter valid name, email, 10-digit mobile number, and work location.'
      );
      return;
    }

    setBusy(true);
    try {
      await api.createOfficer({
        fullName: offName.trim(),
        email: offEmail.trim(),
        phone: offPhone.trim(),
        designation: offDesig.trim(),
        departmentId: offDeptId,
        location: offLocation.trim(),
        subRole: offSubRole,
      });
      setOffName('');
      setOffEmail('');
      setOffPhone('');
      setOffLocation('');
      setOffSubRole('officer');
      await onRefreshData();
      setFeedbackBanner(lang === 'ta' ? 'புதிய அதிகாரி உருவாக்கப்பட்டார்!' : 'Officer account created!');
      onNavigate('officer_list');
    } catch (err: any) {
      setOffError(err.message || 'Could not create officer');
    } finally {
      setBusy(false);
    }
  };

  const handleRunSlaCheck = async () => {
    setBusy(true);
    try {
      const res = await api.runSlaCheck();
      await onRefreshData();
      setFeedbackBanner(
        lang === 'ta'
          ? `SLA ஆய்வு முடிந்தது: ${res.escalatedCount} புகார்(கள்) உயர்த்தப்பட்டன.`
          : `SLA check completed: ${res.escalatedCount} grievance(s) escalated.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleAssignToOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGrievance) return;
    setBusy(true);
    try {
      await api.assignGrievance(activeGrievance.id, {
        officerId: assignOfficerId || officers[0]?.id,
        note: assignNote,
      });
      setAssignNote('');
      await onRefreshData();
      setFeedbackBanner(lang === 'ta' ? 'புகார் அதிகாரிக்கு ஒதுக்கப்பட்டது!' : 'Grievance assigned to officer!');
      onNavigate('monitoring');
    } finally {
      setBusy(false);
    }
  };

  const handleApprovalDecision = async (id: number, decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await api.decideApproval(id, decision);
      await onRefreshData();
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    const data = await api.downloadBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `makkal-pugar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 1. Admin Dashboard
  if (view === 'home') {
    const topCards = [
      { label: t(lang, 'totalGrievances'), value: kpis.total, icon: FileSpreadsheet, tone: 'bg-rose-50 border-rose-200 text-red-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-red-300' },
      { label: t(lang, 'inProgressTab'), value: kpis.inProg, icon: Clock, tone: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300' },
      { label: t(lang, 'resolvedTab'), value: kpis.resolved, icon: CheckCircle2, tone: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300' },
      { label: t(lang, 'pendingTab'), value: kpis.pending, icon: AlertTriangle, tone: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300' },
    ];

    const quickNav = [
      { label: t(lang, 'officerMgmt'), view: 'officer_mgmt' as AdminView, icon: Shield },
      { label: t(lang, 'userMgmt'), view: 'user_mgmt' as AdminView, icon: Users },
      { label: t(lang, 'categoryMgmt'), view: 'categories' as AdminView, icon: Layers },
      { label: t(lang, 'reports'), view: 'reports' as AdminView, icon: BarChart3 },
    ];

    return (
      <div className="space-y-5">
        {feedbackBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold">
            {feedbackBanner}
          </div>
        )}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 text-red-700 flex items-center justify-center shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-red-700 dark:text-red-400">{t(lang, 'welcome')}</div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{user.fullName}</h2>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={handleRunSlaCheck}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-red-700 dark:text-red-300 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-rose-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t(lang, 'runSlaCheckBtn')}
            </button>
            {pendingApprovals.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-xs font-bold whitespace-nowrap"
              >
                {t(lang, 'approvalRequests')} ({pendingApprovals.length})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {topCards.map((c) => (
            <div key={c.label} className={`rounded-2xl border p-4 ${c.tone}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{c.label}</span>
                <c.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-extrabold font-mono-num text-slate-900 dark:text-white">
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickNav.map((q) => (
            <button
              key={q.view}
              type="button"
              onClick={() => onNavigate(q.view)}
              className="min-h-[96px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-red-500 flex flex-col items-center justify-center text-center gap-2 transition-colors"
            >
              <q.icon className="w-6 h-6 text-red-700 dark:text-red-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">{q.label}</span>
            </button>
          ))}
        </div>

        <SourceBundleBanner lang={lang} />
      </div>
    );
  }

  // 2. Grievance Monitoring
  if (view === 'monitoring') {
    const pendingList = grievances.filter((g) => g.status === 'new' || g.status === 'overdue');
    const items = monitorTab === 'all' ? grievances : pendingList;

    return (
      <div className="space-y-4">
        {feedbackBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">
            {feedbackBanner}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setMonitorTab('all')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                monitorTab === 'all' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, 'allTab')} ({grievances.length})
            </button>
            <button
              type="button"
              onClick={() => setMonitorTab('pending')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                monitorTab === 'pending' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, 'pendingTab')} ({pendingList.length})
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleRunSlaCheck}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-rose-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t(lang, 'runSlaCheckBtn')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSelectedGrievance(g);
                onNavigate('assign_grievance');
              }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-red-500 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>{g.grievanceCode}</span>
                  {g.escalated && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                      {t(lang, 'escalatedLabel')}
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {g.title}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span>{g.createdAt.slice(0, 10)}</span>
                  <span>· {g.assignedOfficerName || (lang === 'ta' ? 'ஒதுக்கப்படவில்லை' : 'Unassigned')}</span>
                  <span className="inline-flex items-center gap-0.5 font-mono-num text-red-700 dark:text-red-400">
                    <ThumbsUp className="w-3 h-3" /> {g.upvoteCount ?? 1}
                  </span>
                  {g.citizenRating && (
                    <span className="inline-flex items-center gap-0.5 font-mono-num text-amber-600">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {g.citizenRating}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={g.status} lang={lang} />
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 3. Grievance Assignment & Inspection
  if (view === 'assign_grievance' && activeGrievance) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-mono-num font-bold text-slate-900 dark:text-white">{activeGrievance.grievanceCode}</span>
            {activeGrievance.escalated && (
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold">
                {t(lang, 'escalatedLabel')}
              </span>
            )}
          </div>
          <StatusBadge status={activeGrievance.status} lang={lang} />
        </div>
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
          <div className="text-sm font-bold text-slate-900 dark:text-white">{activeGrievance.title}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400">{activeGrievance.location}</div>
          <div className="text-[11px] font-mono-num text-slate-500 flex items-center gap-3 pt-1">
            <span>{t(lang, 'slaDueLabel')}: {activeGrievance.dueDate || '—'}</span>
            <span>{t(lang, 'upvotesLabel')}: {activeGrievance.upvoteCount ?? 1}</span>
            {(activeGrievance.reopenCount || 0) > 0 && (
              <span className="text-red-700 font-bold">Reopened ×{activeGrievance.reopenCount}</span>
            )}
          </div>
        </div>
        <form onSubmit={handleAssignToOfficer} className="space-y-4">
          <div>
            <label htmlFor="admin-assign-off" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'selectWorker')}
            </label>
            <select
              id="admin-assign-off"
              value={assignOfficerId}
              onChange={(e) => setAssignOfficerId(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            >
              {officers
                .filter((o) => o.status === 'active')
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fullName} — {o.designation}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-assign-note" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'remarksLabel')}
            </label>
            <textarea
              id="admin-assign-note"
              rows={3}
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder={lang === 'ta' ? 'இந்த புகாரை உடனடியாக ஆய்வு செய்யவும்...' : 'Inspect and resolve promptly...'}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {busy ? t(lang, 'loading') : t(lang, 'assignBtn')}
          </button>
        </form>

        {(activeGrievance.comments || []).length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t(lang, 'commentsTitle')}</h4>
            {activeGrievance.comments!.map((c) => (
              <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs">
                <div className="font-bold text-slate-900 dark:text-white">
                  {c.authorName} ({c.authorRole}) · <span className="font-mono-num text-slate-400">{c.createdAt}</span>
                </div>
                <div className="text-slate-700 dark:text-slate-300 mt-0.5">{c.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 4. Officer Management Hub
  if (view === 'officer_mgmt') {
    const items = [
      { label: `${t(lang, 'officerList')} (${officers.length})`, view: 'officer_list' as AdminView, icon: Users },
      { label: t(lang, 'createOfficer'), view: 'create_officer' as AdminView, icon: UserPlus },
      { label: t(lang, 'departmentMgmt'), view: 'departments' as AdminView, icon: Building2 },
      { label: `${t(lang, 'approvalRequests')} (${pendingApprovals.length})`, view: 'approvals' as AdminView, icon: UserCheck },
      { label: t(lang, 'activityLogs'), view: 'logs' as AdminView, icon: Activity },
    ];
    return (
      <div className="max-w-xl mx-auto space-y-3">
        {items.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => onNavigate(item.view)}
            className="w-full min-h-[58px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between hover:border-red-500"
          >
            <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <item.icon className="w-5 h-5 text-red-700 dark:text-red-400" />
              {item.label}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}
      </div>
    );
  }

  // 5. Create Officer
  if (view === 'create_officer') {
    return (
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t(lang, 'createOfficer')}</h3>
        {offError && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
            {offError}
          </div>
        )}
        <form onSubmit={handleCreateOfficer} className="space-y-3.5">
          <div>
            <label htmlFor="co-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t(lang, 'fullNameLabel')}
            </label>
            <input id="co-name" type="text" value={offName} onChange={(e) => setOffName(e.target.value)} className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="co-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t(lang, 'phoneLabel')} *
              </label>
              <input id="co-phone" type="tel" value={offPhone} onChange={(e) => setOffPhone(e.target.value)} placeholder="9876543210" className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            </div>
            <div>
              <label htmlFor="co-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t(lang, 'emailLabel')}
              </label>
              <input id="co-email" type="email" value={offEmail} onChange={(e) => setOffEmail(e.target.value)} placeholder="officer@dept.gov.in" className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="co-desig" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t(lang, 'designationLabel')}
              </label>
              <input id="co-desig" type="text" value={offDesig} onChange={(e) => setOffDesig(e.target.value)} className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            </div>
            <div>
              <label htmlFor="co-dept" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t(lang, 'departmentLabel')}
              </label>
              <select id="co-dept" value={offDeptId} onChange={(e) => setOffDeptId(Number(e.target.value))} className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm">
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{lang === 'ta' ? d.nameTa : d.nameEn}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="co-loc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t(lang, 'workLocationLabel')}
              </label>
              <input id="co-loc" type="text" value={offLocation} onChange={(e) => setOffLocation(e.target.value)} placeholder="Chennai North" className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            </div>
            <div>
              <label htmlFor="co-subrole" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t(lang, 'staffTypeLabel')}
              </label>
              <select id="co-subrole" value={offSubRole} onChange={(e) => setOffSubRole(e.target.value as 'officer' | 'field_worker')} className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm">
                <option value="officer">{t(lang, 'roleDeptOfficer')}</option>
                <option value="field_worker">{t(lang, 'roleFieldWorker')}</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy} className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm">
            {busy ? t(lang, 'loading') : t(lang, 'createBtn')}
          </button>
        </form>
      </div>
    );
  }

  // 6. Officer List
  if (view === 'officer_list') {
    const filtered = officers.filter(
      (o) =>
        o.fullName.toLowerCase().includes(officerSearch.toLowerCase()) ||
        o.email.toLowerCase().includes(officerSearch.toLowerCase())
    );
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {feedbackBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">
            {feedbackBanner}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={officerSearch} onChange={(e) => setOfficerSearch(e.target.value)} placeholder={t(lang, 'search')} className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
          </div>
          <button type="button" onClick={() => onNavigate('create_officer')} className="min-h-[44px] px-4 rounded-xl bg-red-700 text-white text-xs font-bold whitespace-nowrap">
            + {t(lang, 'createBtn')}
          </button>
        </div>
        <div className="space-y-2.5">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setSelectedOfficer(o);
                onNavigate('officer_detail');
              }}
              className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between text-left hover:border-red-500"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950 text-red-700 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{o.fullName}</div>
                  <div className="text-xs text-slate-500">{o.designation} · {lang === 'ta' ? o.departmentNameTa : o.departmentNameEn}</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${o.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {t(lang, `account_${o.status}` as any)}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 7. Officer Detail
  if (view === 'officer_detail' && activeOfficer) {
    return (
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 text-red-700 flex items-center justify-center mx-auto mb-2">
            <User className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{activeOfficer.fullName}</h3>
          <p className="text-xs text-slate-500">{activeOfficer.designation}</p>
        </div>

        <div className="grid grid-cols-2 gap-y-2 text-sm border-t border-b border-slate-200 dark:border-slate-800 py-4">
          <span className="text-slate-500">{t(lang, 'departmentLabel')}</span>
          <span className="font-semibold text-slate-900 dark:text-white">{lang === 'ta' ? activeOfficer.departmentNameTa : activeOfficer.departmentNameEn}</span>
          <span className="text-slate-500">{t(lang, 'phoneLabel')}</span>
          <span className="font-mono-num text-slate-900 dark:text-white">{activeOfficer.phone}</span>
          <span className="text-slate-500">{t(lang, 'emailLabel')}</span>
          <span className="text-slate-900 dark:text-white break-all">{activeOfficer.email}</span>
          <span className="text-slate-500">{t(lang, 'currentStatus')}</span>
          <span className="font-bold text-emerald-700">{t(lang, `account_${activeOfficer.status}` as any)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={async () => {
              await api.updateOfficer(activeOfficer.id, {
                status: activeOfficer.status === 'active' ? 'inactive' : 'active',
              });
              await onRefreshData();
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
          >
            {activeOfficer.status === 'active' ? t(lang, 'removeBtn') : 'Activate'}
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await api.resetOfficerPassword(activeOfficer.id);
              setFeedbackBanner(`Temp password: ${res.temporaryPassword}`);
            }}
            className="min-h-[44px] rounded-xl bg-amber-400 text-slate-950 text-xs font-bold"
          >
            {t(lang, 'resetPasswordBtn')}
          </button>
        </div>
        {feedbackBanner && (
          <div className="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs font-mono-num font-bold text-center">
            {feedbackBanner}
          </div>
        )}
      </div>
    );
  }

  // 8. Approval Requests
  if (view === 'approvals') {
    const offReqs = pendingApprovals.filter((p) => p.role === 'officer');
    const citReqs = pendingApprovals.filter((p) => p.role === 'citizen');
    const list = approvalTab === 'officer' ? offReqs : citReqs;

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setApprovalTab('officer')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
              approvalTab === 'officer' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {t(lang, 'roleOfficer')} ({offReqs.length})
          </button>
          <button
            type="button"
            onClick={() => setApprovalTab('citizen')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
              approvalTab === 'citizen' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {t(lang, 'roleCitizen')} ({citReqs.length})
          </button>
        </div>

        {list.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            {t(lang, 'noData')}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{p.fullName}</div>
                  <div className="text-xs text-slate-500">{p.designation || p.location} · {p.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleApprovalDecision(p.id, 'approve')}
                    aria-label={`${t(lang, 'approve')} ${p.fullName}`}
                    className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleApprovalDecision(p.id, 'reject')}
                    aria-label={`${t(lang, 'reject')} ${p.fullName}`}
                    className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 9. Department Management
  if (view === 'departments') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="space-y-2.5">
          {departments.map((d) => (
            <div key={d.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'ta' ? d.nameTa : d.nameEn} ({d.grievanceCount || 0})
                </div>
                <div className="text-xs text-slate-500">{d.headDesignation}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await api.deleteDepartment(d.id);
                  await onRefreshData();
                }}
                aria-label={`Delete ${d.nameEn}`}
                className="min-h-[40px] min-w-[40px] rounded-xl text-red-600 hover:bg-red-50 flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newDeptTa.trim() || !newDeptEn.trim()) return;
            await api.createDepartment({ nameTa: newDeptTa, nameEn: newDeptEn });
            setNewDeptTa('');
            setNewDeptEn('');
            await onRefreshData();
          }}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" value={newDeptTa} onChange={(e) => setNewDeptTa(e.target.value)} placeholder="துறை பெயர் (தமிழ்)" className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            <input type="text" value={newDeptEn} onChange={(e) => setNewDeptEn(e.target.value)} placeholder="Department Name (English)" className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
          </div>
          <button type="submit" className="w-full min-h-[46px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm">
            + {lang === 'ta' ? 'புதிய துறை சேர்க்க' : 'Add New Department'}
          </button>
        </form>
      </div>
    );
  }

  // 10. User Management (Menu, List, Blocked)
  if (view === 'user_mgmt') {
    const blockedCount = citizens.filter((c) => c.status === 'blocked').length;
    return (
      <div className="max-w-xl mx-auto space-y-3">
        <button type="button" onClick={() => onNavigate('user_list')} className="w-full min-h-[58px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="w-5 h-5 text-red-700" />
            {lang === 'ta' ? `பயனர்கள் பட்டியல் (${citizens.length})` : `Citizens Directory (${citizens.length})`}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
        <button type="button" onClick={() => onNavigate('blocked_users')} className="w-full min-h-[58px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            {lang === 'ta' ? `தடைசெய்யப்பட்ட பயனர்கள் (${blockedCount})` : `Blocked Users (${blockedCount})`}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
        <button type="button" onClick={() => onNavigate('logs')} className="w-full min-h-[58px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-600" />
            {t(lang, 'activityLogs')}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  if (view === 'user_list' || view === 'blocked_users') {
    const list = view === 'blocked_users' ? citizens.filter((c) => c.status === 'blocked') : citizens;
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        {list.map((c) => (
          <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{c.fullName}</div>
              <div className="text-xs text-slate-500">{c.email} · {c.location}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await api.setUserStatus(c.id, c.status === 'blocked' ? 'active' : 'blocked');
                await onRefreshData();
              }}
              className={`min-h-[38px] px-3 rounded-xl text-xs font-bold ${
                c.status === 'blocked' ? 'bg-emerald-600 text-white' : 'bg-red-100 text-red-700'
              }`}
            >
              {c.status === 'blocked' ? t(lang, 'unblockUser') : t(lang, 'blockUser')}
            </button>
          </div>
        ))}
      </div>
    );
  }

  // 11. Categories Management
  if (view === 'categories') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="space-y-2.5">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CategoryIcon iconKey={cat.iconKey} className="w-5 h-5 text-red-700" />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {lang === 'ta' ? cat.nameTa : cat.nameEn}
                  </div>
                  <div className="text-xs text-slate-500">SLA: {cat.slaDays} days</div>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await api.toggleCategory(cat.id, !cat.active);
                  await onRefreshData();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  cat.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cat.active ? t(lang, 'account_active') : t(lang, 'account_inactive')}
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newCatTa.trim() || !newCatEn.trim()) return;
            await api.createCategory({ nameTa: newCatTa, nameEn: newCatEn });
            setNewCatTa('');
            setNewCatEn('');
            await onRefreshData();
          }}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" value={newCatTa} onChange={(e) => setNewCatTa(e.target.value)} placeholder="வகை பெயர் (தமிழ்)" className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            <input type="text" value={newCatEn} onChange={(e) => setNewCatEn(e.target.value)} placeholder="Category Name (English)" className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
          </div>
          <button type="submit" className="w-full min-h-[46px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-1.5">
            <FolderPlus className="w-4 h-4" />
            {lang === 'ta' ? 'புதிய வகை சேர்க்க' : 'Add New Category'}
          </button>
        </form>
      </div>
    );
  }

  // 12. Reports & Analytics
  if (view === 'reports') {
    return (
      <div className="max-w-xl mx-auto space-y-3">
        {[
          lang === 'ta' ? 'புகார் நிலை அறிக்கை' : 'Grievance Status Report',
          lang === 'ta' ? 'துறை வாரியான அறிக்கை' : 'Department-wise Report',
          lang === 'ta' ? 'அதிகாரி வாரியான அறிக்கை' : 'Officer Performance Report',
          lang === 'ta' ? 'காலஅளவு அறிக்கை' : 'SLA Compliance Report',
        ].map((r) => (
          <button key={r} type="button" onClick={() => onNavigate('analytics')} className="w-full min-h-[54px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 dark:text-white">{r}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={() => exportGrievancesToCsv(grievances)} className="min-h-[48px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {t(lang, 'exportCsv')}
          </button>
          <button type="button" onClick={() => window.print()} className="min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" />
            {t(lang, 'printReport')}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'analytics') {
    return (
      <div className="max-w-2xl mx-auto">
        <AnalyticsCharts analytics={analytics} lang={lang} />
      </div>
    );
  }

  // 13. Activity Logs
  if (view === 'logs') {
    const filtered = logs.filter((l) => logFilter === 'all' || l.actionType === logFilter);
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <select
          value={logFilter}
          onChange={(e) => setLogFilter(e.target.value as any)}
          aria-label="Filter activity logs"
          className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="all">{t(lang, 'allTab')}</option>
          <option value="OFFICER_CREATED">Officer Created</option>
          <option value="GRIEVANCE_ASSIGNED">Grievance Assigned</option>
          <option value="LOGIN">Email OTP Logins</option>
        </select>

        <div className="space-y-2.5">
          {filtered.map((l) => (
            <div key={l.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3">
              <Activity className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'ta' ? l.summaryTa : l.summaryEn}
                </div>
                <div className="text-xs font-mono-num text-slate-500 mt-1">
                  {l.actorName} ({l.actorRole}) · {l.createdAt}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 14. System Settings
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {feedbackBanner && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">
          {feedbackBanner}
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-prefix" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {lang === 'ta' ? 'புகார் ID முன்னொட்டு' : 'Grievance ID Prefix'}
            </label>
            <input id="set-prefix" type="text" value={prefixInput} onChange={(e) => setPrefixInput(e.target.value)} className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono-num" />
          </div>
          <div>
            <label htmlFor="set-otp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {lang === 'ta' ? 'Email OTP காலாவதி (நிமிடங்கள்)' : 'Email OTP Expiry (Minutes)'}
            </label>
            <input id="set-otp" type="number" min={1} max={30} value={otpMinInput} onChange={(e) => setOtpMinInput(e.target.value)} className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono-num" />
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-semibold">{lang === 'ta' ? 'பயனர் பதிவு அனுமதி' : 'Allow Citizen Registration'}</span>
          <button type="button" role="switch" aria-checked={allowReg} onClick={() => setAllowReg((v) => !v)} className={`w-12 h-7 rounded-full p-1 ${allowReg ? 'bg-red-700' : 'bg-slate-300'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${allowReg ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-semibold">{lang === 'ta' ? 'அறிவிப்பு அமைப்புகள்' : 'Push Notifications'}</span>
          <button type="button" role="switch" aria-checked={pushOn} onClick={() => setPushOn((v) => !v)} className={`w-12 h-7 rounded-full p-1 ${pushOn ? 'bg-red-700' : 'bg-slate-300'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${pushOn ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-semibold">{t(lang, 'autoAssignLabel')}</span>
          <button type="button" role="switch" aria-checked={autoAssign} onClick={() => setAutoAssign((v) => !v)} className={`w-12 h-7 rounded-full p-1 ${autoAssign ? 'bg-red-700' : 'bg-slate-300'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${autoAssign ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-semibold flex items-center gap-2">
            {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            Dark Mode
          </span>
          <button type="button" onClick={onToggleDarkMode} className="text-xs font-bold text-red-700 dark:text-red-400">
            {darkMode ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-sm font-semibold">{lang === 'ta' ? 'மொழி (Language)' : 'Language'}</span>
          <button type="button" onClick={onToggleLang} className="text-xs font-bold text-red-700 dark:text-red-400">
            {t(lang, 'languageName')} → {t(lang, 'switchLanguageLabel')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={async () => {
              await api.updateSettings({
                grievancePrefix: prefixInput,
                otpExpiryMinutes: Number(otpMinInput),
                allowUserRegistration: allowReg,
                pushNotificationsEnabled: pushOn,
                autoAssignByDepartment: autoAssign,
              });
              await onRefreshData();
              setFeedbackBanner(lang === 'ta' ? 'அமைப்புகள் சேமிக்கப்பட்டன!' : 'System settings saved!');
            }}
            className="min-h-[46px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {t(lang, 'save')}
          </button>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            {lang === 'ta' ? 'தரவு காப்புப்பிரதி (Backup)' : 'Download JSON Backup'}
          </button>
        </div>
      </div>

      <SourceBundleBanner lang={lang} />
    </div>
  );
}
