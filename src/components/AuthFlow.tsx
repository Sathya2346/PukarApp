import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  MapPin,
  Phone,
  Send,
  Settings,
  Shield,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type { Language, UserProfile, UserRole } from '../types/portal';
import { t } from '../i18n/translations';
import { api, setStoredToken } from '../services/api';
import { validateEmail, validateRegistrationForm } from '../utils/grievanceLogic';
import { AppImage } from './CommonUI';

type AuthStep =
  | 'splash'
  | 'onboarding_1'
  | 'onboarding_2'
  | 'role_select'
  | 'login'
  | 'register'
  | 'forgot_password'
  | 'email_otp';

const DEMO_ACCOUNTS: Record<UserRole, { identifier: string; password: string; labelTa: string; labelEn: string }> = {
  citizen: {
    identifier: 'user@email.com',
    password: 'Password@123',
    labelTa: 'பொதுமக்கள் (user@email.com)',
    labelEn: 'Citizen (user@email.com)',
  },
  officer: {
    identifier: 'kumar@dept.gov.in',
    password: 'Password@123',
    labelTa: 'அதிகாரி (kumar@dept.gov.in)',
    labelEn: 'Officer (kumar@dept.gov.in)',
  },
  admin: {
    identifier: 'admin@grievance.gov.in',
    password: 'Password@123',
    labelTa: 'நிர்வாகி (admin@grievance.gov.in)',
    labelEn: 'Admin (admin@grievance.gov.in)',
  },
};

export function AuthFlow({
  lang,
  onToggleLang,
  onAuthenticated,
}: {
  lang: Language;
  onToggleLang: () => void;
  onAuthenticated: (user: UserProfile) => void;
}) {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [step, setStep] = useState<AuthStep>(autostart ? 'role_select' : 'splash');
  const [role, setRole] = useState<UserRole>('citizen');

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDistrict, setRegDistrict] = useState('சென்னை (Chennai)');
  const [regArea, setRegArea] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'register' | 'reset_password'>('login');

  // Email OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [devOtpHint, setDevOtpHint] = useState('');
  const [pendingNotice, setPendingNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const selectRoleAndOpenLogin = (chosenRole: UserRole) => {
    setRole(chosenRole);
    setErrorMsg('');
    setPendingNotice('');
    setIdentifier('');
    setPassword('');
    setStep('login');
  };

  const handleDemoFill = (targetRole: UserRole) => {
    const demo = DEMO_ACCOUNTS[targetRole];
    setRole(targetRole);
    setIdentifier(demo.identifier);
    setPassword(demo.password);
    setErrorMsg('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!identifier.trim() || !password) {
      setErrorMsg(
        lang === 'ta'
          ? 'மின்னஞ்சல் மற்றும் கடவுச்சொல்லை உள்ளிடவும்.'
          : 'Please enter email/username and password.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.login(identifier.trim(), password, role);
      setOtpEmail(res.email);
      setOtpPurpose('login');
      setOtpDigits(['', '', '', '', '', '']);
      setCountdown(res.expiresInSeconds || 300);
      setDevOtpHint(res.devOtpHint || '');
      setStep('email_otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const check = validateRegistrationForm({
      fullName: regName,
      email: regEmail,
      phone: regPhone,
      district: regDistrict,
      area: regArea,
      password: regPassword,
    });

    if (!check.valid) {
      setErrorMsg(
        lang === 'ta'
          ? 'தயவுசெய்து அனைத்து கட்டாய தகவல்களையும் சரியாக நிரப்பவும் (குறைந்தபட்சம் 6 எழுத்து கடவுச்சொல்).'
          : 'Please fill all required fields validly (valid email, area, and min 6-character password).'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.register({
        fullName: regName,
        email: regEmail,
        phone: regPhone,
        district: regDistrict,
        area: regArea,
        password: regPassword,
        role,
      });
      setOtpEmail(res.email);
      setOtpPurpose('register');
      setOtpDigits(['', '', '', '', '', '']);
      setCountdown(res.expiresInSeconds || 300);
      setDevOtpHint(res.devOtpHint || '');
      setStep('email_otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!validateEmail(resetEmail)) {
      setErrorMsg(lang === 'ta' ? 'சரியான மின்னஞ்சலை உள்ளிடவும்.' : 'Enter a valid email address.');
      return;
    }
    if (resetNewPass.length < 6) {
      setErrorMsg(
        lang === 'ta' ? 'புதிய கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்.' : 'New password must be at least 6 characters.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.requestOtp(resetEmail.trim(), role, 'reset_password');
      setOtpEmail(res.email);
      setOtpPurpose('reset_password');
      setOtpDigits(['', '', '', '', '', '']);
      setCountdown(res.expiresInSeconds || 300);
      setDevOtpHint(res.devOtpHint || '');
      setStep('email_otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send reset OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split('');
      const next = [...otpDigits];
      chars.forEach((ch, idx) => {
        if (index + idx < 6) next[index + idx] = ch;
      });
      setOtpDigits(next);
      const focusIdx = Math.min(5, index + chars.length);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = cleaned;
    setOtpDigits(next);
    if (cleaned && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setErrorMsg(
        lang === 'ta'
          ? '6 இலக்க Email OTP எண்ணை முழுமையாக உள்ளிடவும்.'
          : 'Please enter the complete 6-digit Email OTP code.'
      );
      return;
    }

    setSubmitting(true);
    try {
      if (otpPurpose === 'reset_password') {
        await api.resetPassword(otpEmail, role, code, resetNewPass);
        setPendingNotice(
          lang === 'ta'
            ? 'கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது. இப்போது உள்நுழையவும்.'
            : 'Password reset successfully. Please sign in now.'
        );
        setStep('login');
        return;
      }

      const res = await api.verifyOtp(otpEmail, role, code);
      if (res.pendingApproval) {
        setPendingNotice(
          res.message ||
            (lang === 'ta'
              ? 'மின்னஞ்சல் உறுதிப்படுத்தப்பட்டது. நிர்வாகி ஒப்புதலுக்குப் பிறகு உள்நுழையலாம்.'
              : 'Email verified. Your account is pending administrator approval.')
        );
        setStep('login');
        return;
      }

      if (res.token && res.user) {
        if (rememberMe) {
          setStoredToken(res.token);
        } else {
          setStoredToken(res.token);
        }
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'OTP verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await api.requestOtp(otpEmail, role, otpPurpose);
      setCountdown(res.expiresInSeconds || 300);
      setDevOtpHint(res.devOtpHint || '');
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err: any) {
      setErrorMsg(err.message || 'Resend failed');
    } finally {
      setSubmitting(false);
    }
  };

  const roleTitle =
    role === 'admin'
      ? t(lang, 'adminLoginTitle')
      : role === 'officer'
      ? t(lang, 'officerLoginTitle')
      : t(lang, 'citizenLoginTitle');

  // Splash Screen
  if (step === 'splash') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-700 via-red-800 to-red-950 text-white flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
          <span className="text-sm font-semibold tracking-wide text-amber-300">
            {t(lang, 'appName')}
          </span>
          <button
            type="button"
            onClick={onToggleLang}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
          >
            <Globe className="w-4 h-4" />
            {t(lang, 'switchLanguageLabel')}
          </button>
        </header>

        <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 px-6 py-8 max-w-6xl mx-auto w-full">
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left max-w-xl">
            <div className="w-56 sm:w-72 rounded-2xl overflow-hidden shadow-2xl border border-amber-400/30 mb-6">
              <AppImage
                src="/src/assets/images/civic_flag_banner_1794847797197.jpg"
                alt={t(lang, 'appName')}
                className="w-full h-36 sm:h-44 object-cover"
              />
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-3 text-balance">
              {t(lang, 'appName')}
            </h1>
            <p className="text-red-100 text-base sm:text-lg mb-8 max-w-md">
              {t(lang, 'appSubtitle')}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setStep('onboarding_1')}
                className="w-full sm:w-auto min-h-[48px] px-8 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-red-950 font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg transition-colors"
              >
                {t(lang, 'getStarted')}
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setStep('role_select')}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-sm transition-colors"
              >
                {t(lang, 'roleSelectTitle')}
              </button>
            </div>
          </div>

          <div className="flex-1 w-full max-w-lg">
            <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/15 bg-red-900/40">
              <AppImage
                src="/src/assets/images/civic_capitol_building_1794847797106.jpg"
                alt="Secretariat Building"
                className="w-full h-64 sm:h-80 object-cover scale-[1.06]"
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Onboarding Slides 1 & 2
  if (step === 'onboarding_1' || step === 'onboarding_2') {
    const isFirst = step === 'onboarding_1';
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <div className="bg-red-700 text-white px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(isFirst ? 'splash' : 'onboarding_1')}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white/15"
            aria-label={t(lang, 'back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm">{t(lang, 'appName')}</span>
          <button
            type="button"
            onClick={onToggleLang}
            className="min-h-[40px] px-3 rounded-lg bg-white/15 text-xs font-semibold"
          >
            {t(lang, 'switchLanguageLabel')}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center shadow-sm">
            {isFirst ? (
              <>
                <div className="w-52 h-52 mx-auto mb-6 rounded-full overflow-hidden">
                  <AppImage
                    src="/src/assets/images/onboarding_megaphone_1794847797957.jpg"
                    alt={t(lang, 'onb1Title')}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 text-balance">
                  {t(lang, 'onb1Title')}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
                  {t(lang, 'onb1Sub')}
                </p>
              </>
            ) : (
              <>
                <div className="w-full h-40 rounded-2xl overflow-hidden mb-6">
                  <AppImage
                    src="/src/assets/images/civic_flag_banner_1794847797197.jpg"
                    alt={t(lang, 'onb2Title')}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-5 text-balance">
                  {t(lang, 'onb2Title')}
                </h2>
                <ul className="space-y-3 text-left mb-8">
                  {[
                    { icon: Clock, text: t(lang, 'onb2Feat1') },
                    { icon: CheckCircle2, text: t(lang, 'onb2Feat2') },
                    { icon: Send, text: t(lang, 'onb2Feat3') },
                    { icon: Zap, text: t(lang, 'onb2Feat4') },
                  ].map((item) => (
                    <li
                      key={item.text}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-amber-50/70 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 text-sm font-medium"
                    >
                      <item.icon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
              <span className={`h-2 rounded-full transition-all ${isFirst ? 'w-6 bg-red-700' : 'w-2 bg-slate-300'}`} />
              <span className={`h-2 rounded-full transition-all ${!isFirst ? 'w-6 bg-red-700' : 'w-2 bg-slate-300'}`} />
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStep(isFirst ? 'onboarding_2' : 'role_select')}
                className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors"
              >
                {isFirst ? t(lang, 'next') : t(lang, 'getStarted')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setStep('role_select')}
                className="w-full min-h-[44px] rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white text-xs font-semibold"
              >
                {t(lang, 'skip')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Split Desktop / Full Mobile Auth Wrapper for Role Select, Login, Register, Email OTP
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Desktop Left Civic Brand Panel */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-red-800 via-red-900 to-red-950 text-white p-10 flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-10">
            <span className="text-lg font-bold tracking-tight">{t(lang, 'appName')}</span>
            <button
              type="button"
              onClick={onToggleLang}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
            >
              <Globe className="w-4 h-4" />
              {t(lang, 'switchLanguageLabel')}
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden border border-amber-400/25 mb-6 shadow-xl">
            <AppImage
              src="/src/assets/images/civic_flag_banner_1794847797197.jpg"
              alt={t(lang, 'appName')}
              className="w-full h-44 object-cover"
            />
          </div>
          <h1 className="text-3xl font-extrabold leading-snug mb-3 text-balance">
            {t(lang, 'appName')}
          </h1>
          <p className="text-red-100 text-sm leading-relaxed max-w-md">
            {t(lang, 'appSubtitle')}
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden border border-white/15 shadow-lg mt-8">
          <AppImage
            src="/src/assets/images/civic_capitol_building_1794847797106.jpg"
            alt="Civic Secretariat"
            className="w-full h-44 object-cover scale-[1.06]"
          />
        </div>
      </div>

      {/* Right Interactive Auth Area */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Crimson Header */}
        <header className="bg-red-700 text-white px-4 py-3 flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => {
              if (step === 'role_select') setStep('splash');
              else if (step === 'email_otp') setStep('login');
              else setStep('role_select');
            }}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white/15"
            aria-label={t(lang, 'back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-base truncate">
            {step === 'role_select'
              ? t(lang, 'roleSelectTitle')
              : step === 'register'
              ? t(lang, 'registerTitle')
              : step === 'email_otp'
              ? t(lang, 'otpTitle')
              : roleTitle}
          </span>
          <button
            type="button"
            onClick={onToggleLang}
            className="min-h-[40px] px-2.5 rounded-lg bg-white/15 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            {t(lang, 'switchLanguageLabel')}
          </button>
        </header>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md">
            {/* Role Select */}
            {step === 'role_select' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t(lang, 'roleSelectTitle')}
                  </h2>
                  <button
                    type="button"
                    onClick={onToggleLang}
                    className="hidden lg:inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {t(lang, 'switchLanguageLabel')}
                  </button>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => selectRoleAndOpenLogin('citizen')}
                    className="w-full min-h-[72px] p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 hover:border-red-600 flex items-center gap-4 text-left transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-red-700 text-white flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-base">
                        {t(lang, 'roleCitizen')}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {lang === 'ta' ? 'புகார் பதிவு & நிலை அறிய' : 'File & track grievances'}
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-red-700 dark:text-red-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => selectRoleAndOpenLogin('officer')}
                    className="w-full min-h-[72px] p-4 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 hover:border-amber-600 flex items-center gap-4 text-left transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-base">
                        {t(lang, 'roleOfficer')}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {lang === 'ta' ? 'பணி ஒதுக்கீடு & களப்பணி புதுப்பிப்பு' : 'Assign tasks & update field work'}
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => selectRoleAndOpenLogin('admin')}
                    className="w-full min-h-[72px] p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/60 hover:border-red-700 flex items-center gap-4 text-left transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-900 dark:bg-slate-700 text-amber-400 flex items-center justify-center shrink-0">
                      <Settings className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-base">
                        {t(lang, 'roleAdmin')}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {lang === 'ta' ? 'அதிகாரிகள், பயனர்கள் & கண்காணிப்பு' : 'Manage officers, approvals & analytics'}
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                  </button>
                </div>
              </div>
            )}

            {/* Login Screen */}
            {step === 'login' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => setStep('role_select')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-700"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t(lang, 'roleSelectTitle')}
                  </button>
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
                    {role}
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-5">
                  {roleTitle}
                </h2>

                {pendingNotice && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
                    {pendingNotice}
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'emailOrUsernameLabel')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-identifier"
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={DEMO_ACCOUNTS[role].identifier}
                        className="w-full min-h-[44px] pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'passwordLabel')}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-red-700 focus:ring-red-600"
                      />
                      {t(lang, 'rememberMe')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setResetEmail(identifier.includes('@') ? identifier : '');
                        setStep('forgot_password');
                      }}
                      className="text-red-700 dark:text-red-400 font-semibold hover:underline"
                    >
                      {t(lang, 'forgotPassword')}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold text-sm transition-colors"
                  >
                    {submitting ? t(lang, 'loading') : t(lang, 'loginBtn')}
                  </button>
                </form>

                {role === 'citizen' && (
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setStep('register');
                      }}
                      className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      {t(lang, 'newUserRegister')}
                    </button>
                  </div>
                )}

                {/* Quick Demo Autofill Bar */}
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    {t(lang, 'demoQuickFill')}:
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDemoFill(role)}
                    className="w-full min-h-[38px] px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium text-left transition-colors"
                  >
                    {lang === 'ta' ? DEMO_ACCOUNTS[role].labelTa : DEMO_ACCOUNTS[role].labelEn} · Password@123
                  </button>
                </div>
              </div>
            )}

            {/* Citizen Registration */}
            {step === 'register' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-700 mb-3"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t(lang, 'back')}
                </button>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  {t(lang, 'registerTitle')}
                </h2>

                {errorMsg && (
                  <div
                    role="alert"
                    className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'fullNameLabel')}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="reg-name"
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'emailLabel')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="reg-email"
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="name@email.com"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'phoneLabel')}
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="reg-phone"
                        type="tel"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-district" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'districtLabel')}
                      </label>
                      <select
                        id="reg-district"
                        value={regDistrict}
                        onChange={(e) => setRegDistrict(e.target.value)}
                        className="w-full min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                      >
                        <option value="சென்னை (Chennai)">சென்னை (Chennai)</option>
                        <option value="மதுரை (Madurai)">மதுரை (Madurai)</option>
                        <option value="கோவை (Coimbatore)">கோவை (Coimbatore)</option>
                        <option value="திருச்சி (Trichy)">திருச்சி (Trichy)</option>
                        <option value="சேலம் (Salem)">சேலம் (Salem)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reg-area" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t(lang, 'areaLabel')}
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="reg-area"
                          type="text"
                          value={regArea}
                          onChange={(e) => setRegArea(e.target.value)}
                          placeholder="Tambaram"
                          className="w-full min-h-[44px] pl-8 pr-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'passwordLabel')}
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold text-sm transition-colors mt-2"
                  >
                    {submitting ? t(lang, 'loading') : t(lang, 'registerBtn')}
                  </button>
                </form>
              </div>
            )}

            {/* Forgot Password */}
            {step === 'forgot_password' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-700 mb-3"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t(lang, 'back')}
                </button>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {t(lang, 'forgotPassword')}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                  {lang === 'ta'
                    ? 'உங்கள் மின்னஞ்சலுக்கு Email OTP அனுப்பி கடவுச்சொல்லை மீட்டமைக்கவும்.'
                    : 'Reset your password via 6-digit Email OTP verification.'}
                </p>
                {errorMsg && (
                  <div role="alert" className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                    {errorMsg}
                  </div>
                )}
                <form onSubmit={handleRequestResetOtp} className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t(lang, 'emailLabel')}
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="reset-pass" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {lang === 'ta' ? 'புதிய கடவுச்சொல் *' : 'New Password *'}
                    </label>
                    <input
                      id="reset-pass"
                      type="password"
                      value={resetNewPass}
                      onChange={(e) => setResetNewPass(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
                  >
                    {submitting ? t(lang, 'loading') : t(lang, 'otpVerifyBtn')}
                  </button>
                </form>
              </div>
            )}

            {/* Email OTP Verification Screen */}
            {step === 'email_otp' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {t(lang, 'otpTitle')}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">
                  {t(lang, 'otpInstruction')}
                </p>
                <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-5 break-all">
                  {otpEmail}
                </p>

                {devOtpHint && (
                  <div className="mb-5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-left">
                    <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      {t(lang, 'otpSandboxNotice')}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono-num text-lg font-extrabold tracking-widest text-slate-900 dark:text-white">
                        {devOtpHint}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtpDigits(devOtpHint.split(''))}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                      >
                        {lang === 'ta' ? 'நிரப்புக' : 'Auto-fill'}
                      </button>
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="grid grid-cols-6 gap-2 max-w-xs mx-auto">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        aria-label={`Email OTP digit ${idx + 1}`}
                        className="h-12 w-full text-center font-mono-num text-xl font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono-num">
                      {t(lang, 'otpExpiryText')} ({Math.floor(countdown / 60)}:
                      {String(countdown % 60).padStart(2, '0')})
                    </span>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={submitting}
                      className="text-red-700 dark:text-red-400 font-semibold hover:underline"
                    >
                      {t(lang, 'otpResend')}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold text-sm transition-colors"
                  >
                    {submitting ? t(lang, 'loading') : t(lang, 'otpVerifyBtn')}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
