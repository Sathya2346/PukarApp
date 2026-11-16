import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  FileText,
  Globe,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Menu,
  Moon,
  Phone,
  Plus,
  Settings,
  Shield,
  Star,
  Sun,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { Language, UserProfile } from '../types/portal';
import { t } from '../i18n/translations';
import { LogoutModal } from './CommonUI';
import type { CitizenView } from './CitizenPanel';
import type { OfficerView } from './OfficerPanel';
import type { AdminView } from './AdminPanel';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

export function PortalShell({
  user,
  lang,
  onToggleLang,
  darkMode,
  onToggleDarkMode,
  currentView,
  onNavigate,
  unreadCount,
  onLogout,
  children,
}: {
  user: UserProfile;
  lang: Language;
  onToggleLang: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
  unreadCount: number;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const citizenMenu: NavItem[] = [
    { id: 'home', label: t(lang, 'home'), icon: Home },
    { id: 'new_category', label: t(lang, 'newGrievance'), icon: FileText },
    { id: 'my_grievances', label: t(lang, 'myGrievances'), icon: ClipboardList },
    { id: 'services_info', label: t(lang, 'servicesInfo'), icon: Building2 },
    { id: 'notifications', label: t(lang, 'notifications'), icon: Bell },
    { id: 'faq', label: t(lang, 'helpFaq'), icon: HelpCircle },
    { id: 'contact', label: t(lang, 'contactUs'), icon: Phone },
    { id: 'feedback', label: t(lang, 'feedback'), icon: Star },
    { id: 'settings', label: t(lang, 'settings'), icon: Settings },
    { id: 'account', label: t(lang, 'myAccount'), icon: User },
  ];

  const officerMenu: NavItem[] = [
    { id: 'home', label: t(lang, 'home'), icon: Home },
    { id: 'grievance_list', label: t(lang, 'grievanceList'), icon: ClipboardList },
    { id: 'my_tasks', label: t(lang, 'myTasks'), icon: Shield },
    { id: 'assign_work', label: t(lang, 'assignWork'), icon: UserCheck },
    { id: 'team', label: t(lang, 'teamStaff'), icon: Users },
    { id: 'update_status', label: t(lang, 'updateStatus'), icon: Activity },
    { id: 'reports', label: t(lang, 'reports'), icon: FileText },
    { id: 'analytics', label: t(lang, 'analytics'), icon: BarChart3 },
    { id: 'notifications', label: t(lang, 'notifications'), icon: Bell },
    { id: 'faq', label: t(lang, 'helpFaq'), icon: HelpCircle },
    { id: 'settings', label: t(lang, 'settings'), icon: Settings },
  ];

  const adminMenu: NavItem[] = [
    { id: 'home', label: t(lang, 'home'), icon: Home },
    { id: 'monitoring', label: t(lang, 'grievanceMonitoring'), icon: ClipboardList },
    { id: 'officer_mgmt', label: t(lang, 'officerMgmt'), icon: Shield },
    { id: 'user_mgmt', label: t(lang, 'userMgmt'), icon: Users },
    { id: 'categories', label: t(lang, 'categoryMgmt'), icon: Layers },
    { id: 'departments', label: t(lang, 'departmentMgmt'), icon: Building2 },
    { id: 'approvals', label: t(lang, 'approvalRequests'), icon: UserCheck },
    { id: 'reports', label: t(lang, 'reports'), icon: FileText },
    { id: 'analytics', label: t(lang, 'analytics'), icon: BarChart3 },
    { id: 'logs', label: t(lang, 'activityLogs'), icon: Activity },
    { id: 'settings', label: t(lang, 'settings'), icon: Settings },
  ];

  const menuItems =
    user.role === 'admin' ? adminMenu : user.role === 'officer' ? officerMenu : citizenMenu;

  const activeTitle =
    menuItems.find((m) => m.id === currentView)?.label ||
    (user.role === 'admin'
      ? t(lang, 'adminDashboard')
      : user.role === 'officer'
      ? t(lang, 'officerDashboard')
      : t(lang, 'appName'));

  const handleNavClick = (id: string) => {
    onNavigate(id);
    setDrawerOpen(false);
  };

  const centerActionTarget: CitizenView | OfficerView | AdminView =
    user.role === 'citizen'
      ? 'new_category'
      : user.role === 'officer'
      ? 'update_status'
      : 'create_officer';

  const bottomTabs =
    user.role === 'citizen'
      ? [
          { id: 'home', label: t(lang, 'home'), icon: Home },
          { id: 'my_grievances', label: t(lang, 'grievances'), icon: ClipboardList },
          { id: 'notifications', label: t(lang, 'notifications'), icon: Bell },
          { id: 'account', label: t(lang, 'account'), icon: User },
        ]
      : user.role === 'officer'
      ? [
          { id: 'home', label: t(lang, 'home'), icon: Home },
          { id: 'grievance_list', label: t(lang, 'grievances'), icon: ClipboardList },
          { id: 'reports', label: t(lang, 'reports'), icon: BarChart3 },
          { id: 'settings', label: t(lang, 'more'), icon: User },
        ]
      : [
          { id: 'home', label: t(lang, 'home'), icon: Home },
          { id: 'monitoring', label: t(lang, 'grievances'), icon: ClipboardList },
          { id: 'analytics', label: t(lang, 'analytics'), icon: BarChart3 },
          { id: 'settings', label: t(lang, 'more'), icon: User },
        ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      <div className="bg-red-700 text-white p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
            {user.role === 'admin'
              ? t(lang, 'roleAdmin')
              : user.role === 'officer'
              ? t(lang, 'roleOfficer')
              : t(lang, 'roleCitizen')}
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden p-1 rounded-lg hover:bg-white/15"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-white text-red-700 flex items-center justify-center shrink-0 font-bold">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{user.fullName}</div>
            <div className="text-xs text-red-100 truncate">{user.email}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Primary Navigation">
        {menuItems.map((item) => {
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="text-left leading-snug">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
        <button
          type="button"
          onClick={onToggleLang}
          className="w-full min-h-[42px] px-3 py-2 rounded-xl flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-red-700" />
            {lang === 'ta' ? 'மொழி (தமிழ்)' : 'Language (English)'}
          </span>
          <span className="text-red-700 dark:text-red-400 font-bold">{t(lang, 'switchLanguageLabel')}</span>
        </button>

        <button
          type="button"
          onClick={() => setLogoutModalOpen(true)}
          className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          <LogOut className="w-4 h-4" />
          {t(lang, 'logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen no-print">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Slide-Out Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] h-full shadow-2xl z-10">{renderSidebarContent()}</div>
          <button
            type="button"
            className="flex-1 bg-black/50 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close drawer backdrop"
          />
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 bg-red-700 lg:bg-white lg:dark:bg-slate-900 text-white lg:text-slate-900 lg:dark:text-white border-b border-red-800 lg:border-slate-200 lg:dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2 min-w-0">
            {currentView !== 'home' ? (
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="lg:hidden min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center hover:bg-white/15"
                aria-label={t(lang, 'back')}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center hover:bg-white/15"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base lg:text-lg font-bold truncate">{activeTitle}</h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLang}
              className="min-h-[38px] px-3 rounded-lg bg-white/15 lg:bg-slate-100 lg:dark:bg-slate-800 text-white lg:text-slate-800 lg:dark:text-slate-200 text-xs font-bold whitespace-nowrap"
            >
              {t(lang, 'switchLanguageLabel')}
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="Toggle dark mode"
              className="hidden sm:inline-flex min-h-[38px] min-w-[38px] rounded-lg bg-white/15 lg:bg-slate-100 lg:dark:bg-slate-800 items-center justify-center"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onNavigate(user.role === 'admin' ? 'approvals' : 'notifications')}
              aria-label={t(lang, 'notifications')}
              className="relative min-h-[38px] min-w-[38px] rounded-lg bg-white/15 lg:bg-slate-100 lg:dark:bg-slate-800 inline-flex items-center justify-center"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold font-mono-num flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar with Center Red + CTA */}
      <nav
        aria-label="Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 h-16 pb-safe px-2 grid grid-cols-5 items-center no-print"
      >
        {bottomTabs.slice(0, 2).map((tab) => {
          const active = currentView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
                active ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold truncate max-w-[74px]">{tab.label}</span>
            </button>
          );
        })}

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => onNavigate(centerActionTarget)}
            aria-label={t(lang, 'newGrievance')}
            className="w-12 h-12 -mt-5 rounded-full bg-red-700 hover:bg-red-800 text-white shadow-lg flex items-center justify-center border-4 border-white dark:border-slate-900"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {bottomTabs.slice(2, 4).map((tab) => {
          const active = currentView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
                active ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold truncate max-w-[74px]">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <LogoutModal
        open={logoutModalOpen}
        lang={lang}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={() => {
          setLogoutModalOpen(false);
          onLogout();
        }}
      />
    </div>
  );
}
