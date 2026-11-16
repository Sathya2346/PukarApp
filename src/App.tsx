import React, { useCallback, useEffect, useState } from 'react';
import type {
  ActivityLog,
  AnalyticsSummary,
  Category,
  Department,
  Grievance,
  Language,
  NotificationItem,
  SystemSettings,
  UserProfile,
} from './types/portal';
import { api, getStoredToken, setStoredToken } from './services/api';
import { AuthFlow } from './components/AuthFlow';
import { PortalShell } from './components/PortalShell';
import { CitizenPanel, type CitizenView } from './components/CitizenPanel';
import { OfficerPanel, type OfficerView } from './components/OfficerPanel';
import { AdminPanel, type AdminView } from './components/AdminPanel';

const DEFAULT_SETTINGS: SystemSettings = {
  grievancePrefix: '2026',
  otpExpiryMinutes: 5,
  otpMaxAttempts: 5,
  allowUserRegistration: true,
  pushNotificationsEnabled: true,
  autoAssignByDepartment: true,
};

export default function App() {
  const [lang, setLang] = useState<Language>('ta');
  const [darkMode, setDarkMode] = useState(false);
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<string>('home');

  // Shared domain data
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [citizens, setCitizens] = useState<UserProfile[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [officerScope, setOfficerScope] = useState<'assigned' | 'all'>('assigned');
  const [liveToast, setLiveToast] = useState<string>('');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const loadRoleData = useCallback(
    async (activeUser: UserProfile, scopeOverride?: 'assigned' | 'all') => {
      const effectiveScope = scopeOverride ?? officerScope;
      const [bootRes, grievRes, notifRes] = await Promise.all([
        api.bootstrap(),
        api.listGrievances('all', '', activeUser.role === 'officer' ? effectiveScope : 'assigned'),
        api.listNotifications(),
      ]);
      setCategories(bootRes.categories);
      setDepartments(bootRes.departments);
      setSettings(bootRes.settings);
      setPushEnabled(bootRes.settings.pushNotificationsEnabled);
      setGrievances(grievRes.grievances);
      setNotifications(notifRes.notifications);

      if (activeUser.role === 'officer' || activeUser.role === 'admin') {
        const [staffRes, analRes] = await Promise.all([api.listStaff(), api.getAnalytics()]);
        setStaff(staffRes.officers);
        setAnalytics(analRes);
      }

      if (activeUser.role === 'admin') {
        const [usersRes, appRes, logRes] = await Promise.all([
          api.listUsers(),
          api.listApprovals(),
          api.listLogs(),
        ]);
        setCitizens(usersRes.users);
        setPendingApprovals(appRes.pendingUsers);
        setLogs(logRes.logs);
      }
    },
    [officerScope]
  );

  useEffect(() => {
    async function init() {
      try {
        const boot = await api.bootstrap();
        setCategories(boot.categories);
        setDepartments(boot.departments);
        setSettings(boot.settings);

        if (getStoredToken()) {
          const me = await api.me();
          setUser(me.user);
          await loadRoleData(me.user);
        }
      } catch {
        setStoredToken('');
        setUser(null);
      } finally {
        setBooting(false);
      }
    }
    init();
  }, [loadRoleData]);

  // Real-time SSE Subscription for Instant Updates
  useEffect(() => {
    if (!user) return;
    const token = getStoredToken();
    if (!token) return;

    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleLiveEvent = (msgTa: string, msgEn: string) => {
      loadRoleData(user).catch(() => {});
      setLiveToast(lang === 'ta' ? msgTa : msgEn);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setLiveToast(''), 4000);
    };

    es.addEventListener('grievance_created', () =>
      handleLiveEvent('புதிய புகார் பெறப்பட்டது — தரவு புதுப்பிக்கப்பட்டது', 'New grievance logged — live synced')
    );
    es.addEventListener('grievance_updated', () =>
      handleLiveEvent('புகார் நிலை நேரலையில் புதுப்பிக்கப்பட்டது', 'Grievance status updated live')
    );
    es.addEventListener('comment_added', () =>
      handleLiveEvent('புதிய உரையாடல் செய்தி பெறப்பட்டது', 'New comment received live')
    );
    es.addEventListener('sla_escalated', () =>
      handleLiveEvent('SLA காலக்கெடு மீறல் தானாக உயர்த்தப்பட்டது', 'SLA breach auto-escalated live')
    );
    es.addEventListener('approval_decided', () =>
      handleLiveEvent('ஒப்புதல் நிலை புதுப்பிக்கப்பட்டது', 'Approval decision synced live')
    );

    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [user, lang, loadRoleData]);

  const handleAuthenticated = async (authedUser: UserProfile) => {
    setUser(authedUser);
    setCurrentView('home');
    await loadRoleData(authedUser);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore if token already expired
    }
    setStoredToken('');
    setUser(null);
    setCurrentView('home');
  };

  const handleLogoutAll = async () => {
    try {
      await api.logoutAll();
    } catch {
      // ignore
    }
    setStoredToken('');
    setUser(null);
    setCurrentView('home');
  };

  const handleChangeOfficerScope = async (nextScope: 'assigned' | 'all') => {
    setOfficerScope(nextScope);
    if (user) {
      await loadRoleData(user, nextScope);
    }
  };

  const toggleLanguage = () => setLang((prev) => (prev === 'ta' ? 'en' : 'ta'));

  if (booting) {
    return (
      <div className="min-h-screen bg-red-800 text-white flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold">மக்கள் புகார் செயலி | Makkal Pugar Seyali</p>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthFlow
        lang={lang}
        onToggleLang={toggleLanguage}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const unreadCount =
    user.role === 'admin'
      ? pendingApprovals.length
      : notifications.filter((n) => !n.isRead).length;

  return (
    <PortalShell
      user={user}
      lang={lang}
      onToggleLang={toggleLanguage}
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode((d) => !d)}
      currentView={currentView}
      onNavigate={setCurrentView}
      unreadCount={unreadCount}
      onLogout={handleLogout}
    >
      {liveToast && (
        <div
          role="status"
          className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2"
        >
          <span>{liveToast}</span>
          <button
            type="button"
            onClick={() => setLiveToast('')}
            className="text-emerald-700 dark:text-emerald-300 font-bold px-1"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {user.role === 'citizen' && (
        <CitizenPanel
          view={currentView as CitizenView}
          onNavigate={(v) => setCurrentView(v)}
          lang={lang}
          onToggleLang={toggleLanguage}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          user={user}
          onUserUpdated={setUser}
          categories={categories}
          grievances={grievances}
          notifications={notifications}
          onRefreshData={() => loadRoleData(user)}
          pushEnabled={pushEnabled}
          onTogglePush={() => setPushEnabled((p) => !p)}
          onLogoutAll={handleLogoutAll}
        />
      )}

      {user.role === 'officer' && (
        <OfficerPanel
          view={currentView as OfficerView}
          onNavigate={(v) => setCurrentView(v)}
          lang={lang}
          onToggleLang={toggleLanguage}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          user={user}
          onUserUpdated={setUser}
          categories={categories}
          grievances={grievances}
          staff={staff}
          notifications={notifications}
          analytics={analytics}
          onRefreshData={() => loadRoleData(user)}
          pushEnabled={pushEnabled}
          onTogglePush={() => setPushEnabled((p) => !p)}
          scope={officerScope}
          onChangeScope={handleChangeOfficerScope}
          onLogoutAll={handleLogoutAll}
        />
      )}

      {user.role === 'admin' && (
        <AdminPanel
          view={currentView as AdminView}
          onNavigate={(v) => setCurrentView(v)}
          lang={lang}
          onToggleLang={toggleLanguage}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          user={user}
          grievances={grievances}
          officers={staff}
          citizens={citizens}
          pendingApprovals={pendingApprovals}
          departments={departments}
          categories={categories}
          logs={logs}
          settings={settings}
          analytics={analytics}
          onRefreshData={() => loadRoleData(user)}
        />
      )}
    </PortalShell>
  );
}
