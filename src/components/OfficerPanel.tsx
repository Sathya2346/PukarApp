import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  Inbox,
  KeyRound,
  LogOut,
  Mail,
  Moon,
  Phone,
  Printer,
  Search,
  Send,
  Sun,
  ThumbsUp,
  User,
  Users,
  X,
} from 'lucide-react';
import type {
  AnalyticsSummary,
  Category,
  Grievance,
  GrievancePriority,
  GrievanceStatus,
  Language,
  NotificationItem,
  UserProfile,
} from '../types/portal';
import { t } from '../i18n/translations';
import { api } from '../services/api';
import { validateResolutionProof } from '../utils/grievanceLogic';
import {
  AnalyticsCharts,
  AppImage,
  exportGrievancesToCsv,
  FaqAccordion,
  PriorityBadge,
  SourceBundleBanner,
  StatusBadge,
} from './CommonUI';

export type OfficerView =
  | 'home'
  | 'grievance_list'
  | 'grievance_detail'
  | 'assign_work'
  | 'my_tasks'
  | 'update_status'
  | 'progress_timeline'
  | 'field_update'
  | 'notifications'
  | 'team'
  | 'staff_list'
  | 'reports'
  | 'analytics'
  | 'faq'
  | 'settings';

export function OfficerPanel({
  view,
  onNavigate,
  lang,
  onToggleLang,
  darkMode,
  onToggleDarkMode,
  user,
  onUserUpdated,
  categories: _categories,
  grievances,
  staff,
  notifications,
  analytics,
  onRefreshData,
  pushEnabled,
  onTogglePush,
  scope,
  onChangeScope,
  onLogoutAll,
}: {
  view: OfficerView;
  onNavigate: (v: OfficerView) => void;
  lang: Language;
  onToggleLang: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: UserProfile;
  onUserUpdated: (u: UserProfile) => void;
  categories: Category[];
  grievances: Grievance[];
  staff: UserProfile[];
  notifications: NotificationItem[];
  analytics: AnalyticsSummary | null;
  onRefreshData: () => Promise<void>;
  pushEnabled: boolean;
  onTogglePush: () => void;
  scope: 'assigned' | 'all';
  onChangeScope: (nextScope: 'assigned' | 'all') => Promise<void>;
  onLogoutAll: () => Promise<void>;
}) {
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(
    grievances[0] || null
  );
  const [listTab, setListTab] = useState<'new' | 'in_progress' | 'resolved'>('new');
  const [taskTab, setTaskTab] = useState<'assigned' | 'completed'>('assigned');
  const [staffSearch, setStaffSearch] = useState('');

  // Assign work form
  const [workerId, setWorkerId] = useState<number>(staff[0]?.id || 0);
  const [priority, setPriority] = useState<GrievancePriority>('high');
  const [dueDate, setDueDate] = useState('2026-11-25');
  const [assignNote, setAssignNote] = useState('');

  // Status & Field Update form
  const [nextStatus, setNextStatus] = useState<GrievanceStatus>('in_progress');
  const [remarks, setRemarks] = useState('');
  const [fieldPhotos, setFieldPhotos] = useState<string[]>([
    '/src/assets/images/road_repair_crew_1794847798853.jpg',
  ]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Two-way comment state
  const [commentText, setCommentText] = useState('');

  // Profile & Password change state
  const [offName, setOffName] = useState(user.fullName);
  const [offPhone, setOffPhone] = useState(user.phone);
  const [offProfileMsg, setOffProfileMsg] = useState('');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passErr, setPassErr] = useState('');

  const activeGrievance = useMemo(() => {
    if (selectedGrievance) {
      return grievances.find((g) => g.id === selectedGrievance.id) || selectedGrievance;
    }
    return grievances[0] || null;
  }, [grievances, selectedGrievance]);

  const counts = useMemo(() => {
    return {
      assigned: grievances.filter((g) => g.status === 'new' || g.status === 'assigned').length,
      inProgress: grievances.filter((g) => g.status === 'in_progress').length,
      resolved: grievances.filter((g) => g.status === 'resolved').length,
      overdue: grievances.filter((g) => g.status === 'overdue').length,
    };
  }, [grievances]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGrievance) return;
    setSubmitting(true);
    setActionMsg('');
    try {
      await api.assignGrievance(activeGrievance.id, {
        workerId: workerId || staff[0]?.id,
        officerId: user.id,
        priority,
        dueDate,
        note: assignNote,
      });
      await onRefreshData();
      setAssignNote('');
      setActionMsg(lang === 'ta' ? 'பணி வெற்றிகரமாக ஒதுக்கப்பட்டது!' : 'Task assigned successfully!');
      onNavigate('grievance_detail');
    } catch (err: any) {
      setActionMsg(err.message || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGrievance) return;
    setActionError('');
    setActionMsg('');

    const proof = validateResolutionProof({
      nextStatus,
      fieldPhotoUrls: fieldPhotos,
      remarks,
    });
    if (!proof.ok) {
      setActionError(
        proof.reason === 'photo_required'
          ? lang === 'ta'
            ? 'தீர்க்கப்பட்டது என மாற்ற குறைந்தது 1 களப்பணி புகைப்படம் சேர்க்கவும்.'
            : 'At least 1 after-repair field photo is required before marking as Resolved.'
          : lang === 'ta'
          ? 'தீர்க்கப்பட்டது என மாற்ற குறைந்தது 10 எழுத்துகள் கொண்ட பணி குறிப்பு தேவை.'
          : 'Detailed resolution remarks (minimum 10 characters) are required before marking Resolved.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await api.updateGrievanceStatus(activeGrievance.id, {
        status: nextStatus,
        remarks,
        fieldPhotoUrls: fieldPhotos,
      });
      await onRefreshData();
      setRemarks('');
      setActionMsg(lang === 'ta' ? 'நிலை வெற்றிகரமாக புதுப்பிக்கப்பட்டது!' : 'Status updated successfully!');
      onNavigate('progress_timeline');
    } catch (err: any) {
      setActionError(err.message || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setUploadingPhoto(true);
        try {
          const uploaded = await api.uploadImage(reader.result, file.name);
          setFieldPhotos((prev) => [...prev.slice(0, 3), uploaded.url]);
        } catch (err: any) {
          setActionError(err.message || 'Photo upload failed');
        } finally {
          setUploadingPhoto(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // 1. Officer Dashboard
  if (view === 'home') {
    const kpis = [
      { label: t(lang, 'assignedGrievances'), value: counts.assigned, icon: Inbox, tone: 'bg-rose-50 border-rose-200 text-red-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-red-300' },
      { label: t(lang, 'inProgressTab'), value: counts.inProgress, icon: Clock, tone: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300' },
      { label: t(lang, 'resolvedTab'), value: counts.resolved, icon: CheckCircle2, tone: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300' },
      { label: t(lang, 'overdue'), value: counts.overdue, icon: AlertTriangle, tone: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300' },
    ];

    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-red-700 dark:text-red-400 font-semibold flex items-center gap-2">
                <span>{t(lang, 'welcome')}</span>
                {user.subRole === 'field_worker' && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    {t(lang, 'roleFieldWorker')}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{user.fullName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user.designation}
                {user.departmentNameEn ? ` · ${lang === 'ta' ? user.departmentNameTa : user.departmentNameEn}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChangeScope('assigned')}
              className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold ${
                scope === 'assigned' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, 'scopeAssigned')}
            </button>
            <button
              type="button"
              onClick={() => onChangeScope('all')}
              className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold ${
                scope === 'all' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, 'scopeAllDept')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.tone}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{k.label}</span>
                <k.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-extrabold font-mono-num text-slate-900 dark:text-white">
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t(lang, 'grievanceList'), view: 'grievance_list' as OfficerView, icon: Inbox },
            { label: t(lang, 'myTasks'), view: 'my_tasks' as OfficerView, icon: ClipboardList },
            { label: t(lang, 'teamStaff'), view: 'team' as OfficerView, icon: Users },
            { label: t(lang, 'reports'), view: 'reports' as OfficerView, icon: BarChart3 },
          ].map((btn) => (
            <button
              key={btn.view}
              type="button"
              onClick={() => onNavigate(btn.view)}
              className="min-h-[88px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-red-500 flex flex-col items-center justify-center gap-2 text-center transition-colors"
            >
              <btn.icon className="w-6 h-6 text-red-700 dark:text-red-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 2. Grievance List (New / In Progress / Resolved + Scope Toggle)
  if (view === 'grievance_list') {
    const newItems = grievances.filter((g) => g.status === 'new' || g.status === 'assigned');
    const progItems = grievances.filter((g) => g.status === 'in_progress' || g.status === 'overdue');
    const resItems = grievances.filter((g) => g.status === 'resolved');
    const currentList = listTab === 'new' ? newItems : listTab === 'in_progress' ? progItems : resItems;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl w-fit">
            {[
              { id: 'new' as const, label: `${t(lang, 'newTab')} (${newItems.length})` },
              { id: 'in_progress' as const, label: `${t(lang, 'inProgressTab')} (${progItems.length})` },
              { id: 'resolved' as const, label: `${t(lang, 'resolvedTab')} (${resItems.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setListTab(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  listTab === tab.id ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChangeScope('assigned')}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold ${
                scope === 'assigned' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, 'scopeAssigned')}
            </button>
            <button
              type="button"
              onClick={() => onChangeScope('all')}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold ${
                scope === 'all' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, 'scopeAllDept')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {currentList.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSelectedGrievance(g);
                onNavigate('grievance_detail');
              }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-red-500 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                  {g.grievanceCode}
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {g.title}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {g.createdAt.slice(0, 10)} · {g.location}
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

  // 3. Grievance Detail (with Two-Way Comments & SLA/Upvote Meta)
  if (view === 'grievance_detail' && activeGrievance) {
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        {actionMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">
            {actionMsg}
          </div>
        )}
        <div className="grid grid-cols-2 gap-y-2 text-sm border-b border-slate-200 dark:border-slate-800 pb-4">
          <span className="text-slate-500">{t(lang, 'grievanceIdLabel')}</span>
          <span className="font-mono-num font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
            <span>{activeGrievance.grievanceCode}</span>
            {activeGrievance.escalated && (
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold">
                {t(lang, 'escalatedLabel')}
              </span>
            )}
          </span>

          <span className="text-slate-500">{t(lang, 'departmentLabel')}</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {lang === 'ta' ? activeGrievance.categoryNameTa : activeGrievance.categoryNameEn}
          </span>

          <span className="text-slate-500">{t(lang, 'currentStatus')}</span>
          <div><StatusBadge status={activeGrievance.status} lang={lang} /></div>

          <span className="text-slate-500">{t(lang, 'slaDueLabel')}</span>
          <span className="font-mono-num text-slate-700 dark:text-slate-300">{activeGrievance.dueDate || '—'}</span>

          <span className="text-slate-500">{t(lang, 'upvotesLabel')}</span>
          <span className="font-mono-num font-bold text-red-700 dark:text-red-400 inline-flex items-center gap-1">
            <ThumbsUp className="w-3.5 h-3.5" />
            {activeGrievance.upvoteCount ?? 1}
          </span>

          <span className="text-slate-500">{t(lang, 'grievanceLocLabel')}</span>
          <span className="text-slate-700 dark:text-slate-300">{activeGrievance.location}</span>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">{t(lang, 'grievanceDescLabel')}</div>
          <p className="text-sm text-slate-800 dark:text-slate-200">{activeGrievance.description}</p>
        </div>

        {activeGrievance.photoUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeGrievance.photoUrls.map((url, idx) => (
              <div key={idx} className="h-28 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <AppImage src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => onNavigate('assign_work')}
            className="min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
          >
            {t(lang, 'assignWork')}
          </button>
          <button
            type="button"
            onClick={() => {
              setActionError('');
              setNextStatus(activeGrievance.status === 'resolved' ? 'resolved' : 'in_progress');
              onNavigate('update_status');
            }}
            className="min-h-[46px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {t(lang, 'updateStatus')}
          </button>
        </div>

        {/* Two-Way Citizen & Officer Thread */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            {t(lang, 'commentsTitle')} ({(activeGrievance.comments || []).length})
          </h4>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {(activeGrievance.comments || []).map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-xl text-xs ${
                  c.authorRole === 'citizen'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900'
                    : 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white mb-1">
                  <span>{c.authorName} ({c.authorRole})</span>
                  <span className="text-[10px] font-mono-num text-slate-400">{c.createdAt}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">{c.message}</p>
              </div>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (commentText.trim().length < 2) return;
              await api.addComment(activeGrievance.id, commentText.trim());
              setCommentText('');
              await onRefreshData();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t(lang, 'commentPlaceholder')}
              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            />
            <button
              type="submit"
              className="min-h-[42px] px-3.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {t(lang, 'postCommentBtn')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 4. Assign Work
  if (view === 'assign_work' && activeGrievance) {
    return (
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500">{t(lang, 'grievanceIdLabel')}</span>
          <span className="font-mono-num font-bold text-slate-900 dark:text-white">{activeGrievance.grievanceCode}</span>
        </div>

        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label htmlFor="assign-worker" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'selectWorker')}
            </label>
            <select
              id="assign-worker"
              value={workerId}
              onChange={(e) => setWorkerId(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} — {s.designation}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'priorityLabel')}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['high', 'medium', 'low'] as GrievancePriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
                    priority === p
                      ? p === 'high'
                        ? 'bg-red-700 text-white border-red-700'
                        : p === 'medium'
                        ? 'bg-amber-400 text-slate-950 border-amber-400'
                        : 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {t(lang, `priority_${p}` as any)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="assign-due" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'dueDateLabel')}
            </label>
            <input
              id="assign-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <label htmlFor="assign-note" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'remarksLabel')}
            </label>
            <textarea
              id="assign-note"
              rows={3}
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder={lang === 'ta' ? 'பணி விரைவாக செய்யப்படவும்...' : 'Execute repair immediately...'}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {submitting ? t(lang, 'loading') : t(lang, 'assignBtn')}
          </button>
        </form>
      </div>
    );
  }

  // 5. My Tasks
  if (view === 'my_tasks') {
    const assignedTasks = grievances.filter((g) => g.status !== 'resolved');
    const completedTasks = grievances.filter((g) => g.status === 'resolved');
    const items = taskTab === 'assigned' ? assignedTasks : completedTasks;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setTaskTab('assigned')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
              taskTab === 'assigned' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {lang === 'ta' ? `ஒதுக்கப்பட்டது (${assignedTasks.length})` : `Assigned (${assignedTasks.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTaskTab('completed')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
              taskTab === 'completed' ? 'bg-red-700 text-white' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {lang === 'ta' ? `முடிக்கப்பட்டது (${completedTasks.length})` : `Completed (${completedTasks.length})`}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSelectedGrievance(g);
                onNavigate('update_status');
              }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-red-500 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">{g.grievanceCode}</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{g.title}</div>
                <div className="text-xs text-slate-500 mt-1">{g.dueDate || g.createdAt.slice(0, 10)}</div>
              </div>
              <PriorityBadge priority={g.priority} lang={lang} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 6. Update Status & Field Work Update (with Proof-of-Resolution Gate)
  if ((view === 'update_status' || view === 'field_update') && activeGrievance) {
    return (
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <span className="font-mono-num font-bold text-slate-900 dark:text-white">{activeGrievance.grievanceCode}</span>
          <StatusBadge status={activeGrievance.status} lang={lang} />
        </div>

        {actionError && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">
            {actionError}
          </div>
        )}

        <form onSubmit={handleStatusUpdate} className="space-y-4">
          <div>
            <label htmlFor="officer-next-status" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'updateStatus')}
            </label>
            <select
              id="officer-next-status"
              value={nextStatus}
              onChange={(e) => {
                setActionError('');
                setNextStatus(e.target.value as GrievanceStatus);
              }}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            >
              <option value="assigned">{t(lang, 'status_assigned')}</option>
              <option value="in_progress">{t(lang, 'status_in_progress')}</option>
              <option value="resolved">{t(lang, 'status_resolved')}</option>
              <option value="overdue">{t(lang, 'status_overdue')}</option>
            </select>
            {nextStatus === 'resolved' && (
              <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-medium">
                {t(lang, 'proofRuleNotice')}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="officer-remarks" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t(lang, 'remarksLabel')}
              </label>
              <span className="text-[11px] font-mono-num text-slate-400">{remarks.length} / 300</span>
            </div>
            <textarea
              id="officer-remarks"
              rows={3}
              maxLength={300}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                lang === 'ta'
                  ? 'சாலை பழுது பார்க்கும் பணி நடைபெற்று வருகிறது...'
                  : 'Asphalt repair work completed on site...'
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t(lang, 'fieldPhotoLabel')}
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              {fieldPhotos.map((p, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <AppImage src={p} alt={`Field ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFieldPhotos((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`Remove field photo ${idx + 1}`}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-red-700 text-slate-500">
                <Camera className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-semibold">{uploadingPhoto ? '...' : 'Add'}</span>
                <input type="file" accept="image/*" onChange={handleFieldPhoto} className="hidden" />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || uploadingPhoto}
            className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {submitting ? t(lang, 'loading') : t(lang, 'updateStatusBtn')}
          </button>
        </form>
      </div>
    );
  }

  // 7. Grievance Progress Timeline
  if (view === 'progress_timeline' && activeGrievance) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="text-center font-mono-num text-lg font-extrabold text-slate-900 dark:text-white">
          {activeGrievance.grievanceCode}
        </div>
        <ol className="space-y-4">
          {(activeGrievance.timeline || []).map((step, i) => (
            <li key={step.id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'ta' ? step.titleTa : step.titleEn}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">{step.remarks}</div>
                <div className="text-[11px] font-mono-num text-slate-400 mt-0.5">
                  {step.actorName} · {step.createdAt}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => onNavigate('field_update')}
          className="w-full min-h-[46px] rounded-xl bg-red-700 text-white font-bold text-sm"
        >
          {t(lang, 'fieldWorkUpdate')}
        </button>
      </div>
    );
  }

  // 8. Notifications
  if (view === 'notifications') {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        {notifications.map((n) => (
          <div key={n.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3">
            <Bell className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {lang === 'ta' ? n.titleTa : n.titleEn}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {lang === 'ta' ? n.messageTa : n.messageEn}
              </p>
              <div className="text-[11px] font-mono-num text-slate-400 mt-1">{n.createdAt}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 9. Team & Staff List
  if (view === 'team') {
    const groups = lang === 'ta'
      ? ['களப்பணி ஊழியர்கள்', 'பிரிவு அதிகாரிகள்', 'மண்டல அதிகாரிகள்', 'பயனர் கணக்குகள்']
      : ['Field Workers', 'Section Officers', 'Zonal Officers', 'Citizen Accounts'];
    return (
      <div className="max-w-xl mx-auto space-y-3">
        {groups.map((grp) => (
          <button
            key={grp}
            type="button"
            onClick={() => onNavigate('staff_list')}
            className="w-full min-h-[58px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between hover:border-red-500"
          >
            <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-3">
              <Users className="w-5 h-5 text-amber-600" />
              {grp}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}
      </div>
    );
  }

  if (view === 'staff_list') {
    const filtered = staff.filter(
      (s) =>
        s.fullName.toLowerCase().includes(staffSearch.toLowerCase()) ||
        s.phone.includes(staffSearch)
    );
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={staffSearch}
            onChange={(e) => setStaffSearch(e.target.value)}
            placeholder={t(lang, 'search')}
            className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <div className="space-y-2.5">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950 text-red-700 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{s.fullName}</div>
                  <div className="text-xs text-slate-500">{s.designation}</div>
                  <div className="text-xs font-mono-num text-slate-600 dark:text-slate-400">{s.phone}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-rose-50 text-red-700 flex items-center justify-center"
                    aria-label={`Call ${s.fullName}`}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                <a
                  href={`mailto:${s.email}`}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"
                  aria-label={`Email ${s.fullName}`}
                >
                  <Mail className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 10. Reports & Analytics
  if (view === 'reports') {
    const reportItems = lang === 'ta'
      ? ['புகார் சுருக்க அறிக்கை', 'பிரிவு வாரியான அறிக்கை', 'காலகட்ட அறிக்கை', 'பணி நிறைவு அறிக்கை', 'மண்டல அளவு அறிக்கை']
      : ['Grievance Summary Report', 'Department-wise Report', 'SLA Timeline Report', 'Completion Report', 'Zonal Performance Report'];
    return (
      <div className="max-w-xl mx-auto space-y-3">
        {reportItems.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onNavigate('analytics')}
            className="w-full min-h-[54px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between hover:border-red-500"
          >
            <span className="text-sm font-bold text-slate-900 dark:text-white">{r}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => exportGrievancesToCsv(grievances)}
            className="min-h-[48px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t(lang, 'exportCsv')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
          >
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

  // 11. Officer FAQ
  if (view === 'faq') {
    const items = lang === 'ta'
      ? [
          { q: 'புகார் எவ்வாறு கையாளப்படுகிறது?', a: 'புதிய புகார் பட்டியலில் இருந்து திறந்து களப்பணி ஊழியருக்கு ஒதுக்கீடு செய்யவும்.' },
          { q: 'நிலை புதுப்பிப்பது எப்படி?', a: 'புகார் விவரத்தில் "நிலை மேம்படுத்தல்" அழுத்தி குறிப்பு மற்றும் புகைப்படம் சேர்க்கவும்.' },
          { q: 'அறிக்கை எடுப்பது எப்படி?', a: '"அறிக்கைகள்" பிரிவில் Excel / CSV அல்லது Print / PDF பொத்தானை அழுத்தவும்.' },
        ]
      : [
          { q: 'How are new grievances handled?', a: 'Open any ticket in Grievance List and assign it to a field crew member with a priority and due date.' },
          { q: 'How do I update field status?', a: 'Click "Update Status", select the new status, attach field inspection photos, and submit.' },
          { q: 'How do I export reports?', a: 'Go to Reports and choose Export Excel/CSV or Print/PDF Report.' },
        ];
    return (
      <div className="max-w-2xl mx-auto">
        <FaqAccordion items={items} />
      </div>
    );
  }

  // 12. Officer Settings (with Profile Edit, Change Password & Logout All)
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        <button
          type="button"
          onClick={onToggleLang}
          className="w-full min-h-[56px] px-4 flex items-center justify-between text-left"
        >
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {lang === 'ta' ? 'மொழி (Language)' : 'Language (மொழி)'}
          </span>
          <span className="text-xs font-bold text-red-700 dark:text-red-400">
            {t(lang, 'languageName')} → {t(lang, 'switchLanguageLabel')}
          </span>
        </button>

        <div className="min-h-[56px] px-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(lang, 'notifications')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={pushEnabled}
            onClick={onTogglePush}
            className={`w-12 h-7 rounded-full transition-colors p-1 ${
              pushEnabled ? 'bg-red-700' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                pushEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          className="w-full min-h-[56px] px-4 flex items-center justify-between text-left"
        >
          <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            {lang === 'ta' ? 'டார்க் Mode' : 'Dark Mode'}
          </span>
          <span className="text-xs font-semibold text-slate-500">{darkMode ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Officer Profile & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setOffProfileMsg('');
            const res = await api.updateProfile({ fullName: offName, phone: offPhone });
            onUserUpdated(res.user);
            setOffProfileMsg(lang === 'ta' ? 'சுயவிவரம் சேமிக்கப்பட்டது!' : 'Profile saved!');
          }}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <User className="w-4 h-4 text-red-700" />
            {t(lang, 'editDetails')}
          </h3>
          {offProfileMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">{offProfileMsg}</div>
          )}
          <input
            type="text"
            value={offName}
            onChange={(e) => setOffName(e.target.value)}
            placeholder={t(lang, 'fullNameLabel')}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <input
            type="tel"
            value={offPhone}
            onChange={(e) => setOffPhone(e.target.value)}
            placeholder={t(lang, 'phoneLabel')}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <button type="submit" className="w-full min-h-[44px] rounded-xl bg-red-700 text-white text-xs font-bold">
            {t(lang, 'save')}
          </button>
        </form>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-red-700" />
            {t(lang, 'changePasswordTitle')}
          </h3>
          {passMsg && <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">{passMsg}</div>}
          {passErr && <div role="alert" className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">{passErr}</div>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPassMsg('');
              setPassErr('');
              try {
                await api.changePassword(curPass, newPass);
                setCurPass('');
                setNewPass('');
                setPassMsg(lang === 'ta' ? 'கடவுச்சொல் மாற்றப்பட்டது!' : 'Password changed!');
              } catch (err: any) {
                setPassErr(err.message || 'Password change failed');
              }
            }}
            className="space-y-2.5"
          >
            <input
              type="password"
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              placeholder={t(lang, 'currentPasswordLabel')}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder={t(lang, 'newPasswordLabel')}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <button type="submit" className="w-full min-h-[44px] rounded-xl bg-amber-400 text-slate-950 text-xs font-bold">
              {t(lang, 'changePasswordBtn')}
            </button>
          </form>
          <button
            type="button"
            onClick={onLogoutAll}
            className="w-full min-h-[42px] rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-bold inline-flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t(lang, 'logoutAllBtn')}
          </button>
        </div>
      </div>

      <SourceBundleBanner lang={lang} />
    </div>
  );
}
