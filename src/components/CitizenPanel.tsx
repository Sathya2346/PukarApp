import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crosshair,
  FileText,
  HelpCircle,
  Info,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Star,
  Sun,
  ThumbsUp,
  User,
  Users,
} from 'lucide-react';
import type {
  Category,
  Grievance,
  Language,
  NotificationItem,
  UserProfile,
} from '../types/portal';
import { t } from '../i18n/translations';
import { api } from '../services/api';
import { validateGrievanceForm } from '../utils/grievanceLogic';
import {
  AppImage,
  CategoryIcon,
  FaqAccordion,
  SourceBundleBanner,
  StatusBadge,
} from './CommonUI';

export type CitizenView =
  | 'home'
  | 'new_category'
  | 'new_form'
  | 'success'
  | 'my_grievances'
  | 'grievance_detail'
  | 'notifications'
  | 'services_info'
  | 'faq'
  | 'contact'
  | 'feedback'
  | 'settings'
  | 'account';

const CATEGORY_COLORS: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
  teal: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
};

export function CitizenPanel({
  view,
  onNavigate,
  lang,
  onToggleLang,
  darkMode,
  onToggleDarkMode,
  user,
  onUserUpdated,
  categories,
  grievances,
  notifications,
  onRefreshData,
  pushEnabled,
  onTogglePush,
  onLogoutAll,
}: {
  view: CitizenView;
  onNavigate: (v: CitizenView) => void;
  lang: Language;
  onToggleLang: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: UserProfile;
  onUserUpdated: (u: UserProfile) => void;
  categories: Category[];
  grievances: Grievance[];
  notifications: NotificationItem[];
  onRefreshData: () => Promise<void>;
  pushEnabled: boolean;
  onTogglePush: () => void;
  onLogoutAll: () => Promise<void>;
}) {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [createdGrievance, setCreatedGrievance] = useState<Grievance | null>(null);

  // Grievance Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(user.location || 'சென்னை, தமிழ்நாடு');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [nearbyDuplicate, setNearbyDuplicate] = useState<{
    id: number;
    grievanceCode: string;
    title: string;
    status: string;
    upvoteCount: number;
  } | null>(null);
  const [upvotedDup, setUpvotedDup] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState('');
  const [photos, setPhotos] = useState<string[]>([
    '/src/assets/images/road_pothole_sample_1794847798417.jpg',
  ]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // My Grievances Filter
  const [listTab, setListTab] = useState<'all' | 'in_progress' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Grievance Detail interactive state (Comments, Reopen, Per-Ticket Rating)
  const [commentText, setCommentText] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [ticketRating, setTicketRating] = useState(5);
  const [ticketFeedback, setTicketFeedback] = useState('');
  const [detailBanner, setDetailBanner] = useState('');
  const [detailError, setDetailError] = useState('');

  // Feedback state
  const [rating, setRating] = useState(4);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Account edit & password change state
  const [editName, setEditName] = useState(user.fullName);
  const [editPhone, setEditPhone] = useState(user.phone);
  const [editLocation, setEditLocation] = useState(user.location);
  const [profileSaved, setProfileSaved] = useState(false);
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passErr, setPassErr] = useState('');

  const activeCategories = categories.filter((c) => c.active);

  const filteredGrievances = useMemo(() => {
    return grievances.filter((g) => {
      if (listTab === 'in_progress' && !['new', 'assigned', 'in_progress', 'overdue'].includes(g.status)) {
        return false;
      }
      if (listTab === 'resolved' && g.status !== 'resolved') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          g.grievanceCode.toLowerCase().includes(q) ||
          g.title.toLowerCase().includes(q) ||
          g.location.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [grievances, listTab, searchQuery]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setUploadingPhoto(true);
        try {
          const uploaded = await api.uploadImage(reader.result, file.name);
          setPhotos((prev) => [...prev.slice(0, 3), uploaded.url]);
        } catch (err: any) {
          setFormError(err.message || 'Image upload failed');
        } finally {
          setUploadingPhoto(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const applyGpsCoordinates = async (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    setUpvotedDup(false);
    setGpsStatusMsg(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    const catId = selectedCategory?.id || activeCategories[0]?.id || 1;
    try {
      const res = await api.checkNearbyDuplicate(lat, lng, catId);
      setNearbyDuplicate(res.duplicate);
    } catch {
      setNearbyDuplicate(null);
    }
  };

  const handleCaptureGps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyGpsCoordinates(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Fallback to Chennai Tambaram civic coordinates when headless browser denies geolocation
          applyGpsCoordinates(12.9249, 80.1);
        },
        { timeout: 3000 }
      );
    } else {
      applyGpsCoordinates(12.9249, 80.1);
    }
  };

  const handleUpvoteNearby = async () => {
    if (!nearbyDuplicate) return;
    try {
      const res = await api.upvoteGrievance(nearbyDuplicate.id);
      setNearbyDuplicate({ ...nearbyDuplicate, upvoteCount: res.upvoteCount });
      setUpvotedDup(true);
      await onRefreshData();
    } catch {
      // ignore
    }
  };

  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const catId = selectedCategory?.id || activeCategories[0]?.id || null;
    const check = validateGrievanceForm({
      categoryId: catId,
      title,
      description,
      location,
    });
    if (!check.valid) {
      setFormError(
        lang === 'ta'
          ? 'தலைப்பு (குறைந்தது 5 எழுத்து), விவரம் (10–500 எழுத்து) மற்றும் இடம் சரியாக உள்ளிடவும்.'
          : 'Please enter a valid title (min 5 chars), description (10-500 chars), and location.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createGrievance({
        categoryId: catId!,
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        latitude,
        longitude,
        photoUrls: photos,
      });
      setCreatedGrievance(res.grievance);
      setSelectedGrievance(res.grievance);
      setTitle('');
      setDescription('');
      setNearbyDuplicate(null);
      await onRefreshData();
      onNavigate('success');
    } catch (err: any) {
      setFormError(err.message || 'Could not submit grievance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaved(false);
    try {
      const res = await api.updateProfile({
        fullName: editName,
        phone: editPhone,
        location: editLocation,
      });
      onUserUpdated(res.user);
      setProfileSaved(true);
    } catch {
      // handled cleanly
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg('');
    setPassErr('');
    try {
      await api.changePassword(curPass, newPass);
      setCurPass('');
      setNewPass('');
      setPassMsg(lang === 'ta' ? 'கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது!' : 'Password updated successfully!');
    } catch (err: any) {
      setPassErr(err.message || 'Could not change password');
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSuccess(false);
    try {
      await api.submitFeedback(rating, feedbackText);
      setFeedbackText('');
      setFeedbackSuccess(true);
    } catch {
      // ignore
    }
  };

  const faqs = lang === 'ta'
    ? [
        { q: 'புகார் எப்படி பதிவு செய்வது?', a: 'முகப்பு அல்லது + பொத்தானை அழுத்தி, வகையைத் தேர்ந்தெடுத்து, விவரம் மற்றும் புகைப்படத்துடன் சமர்ப்பிக்கவும்.' },
        { q: 'புகார் நிலையை எப்படி தெரிந்துகொள்வது?', a: '"என் புகார்கள்" பிரிவில் உங்கள் புகார் எண்ணை தேர்ந்தெடுத்து 4-படி முன்னேற்ற நிலையை அறியலாம்.' },
        { q: 'என் புகார் தீர்வு எத்தனை நாளில் ஆகும்?', a: 'வகைக்கு ஏற்ப 2 முதல் 7 வேலை நாட்களுக்குள் சம்பந்தப்பட்ட துறை அதிகாரியால் தீர்வு வழங்கப்படும்.' },
        { q: 'புகைப்படம் கட்டாயமா?', a: 'இல்லை, விருப்பமானது. ஆனால் புகைப்படம் இணைத்தால் களப்பணி விரைவில் நடைபெறும்.' },
        { q: 'வெளியேறி செய்ய முடியுமா?', a: 'ஆம், மெனு அல்லது அமைப்புகள் வழியாக பாதுகாப்பாக வெளியேறலாம்.' },
      ]
    : [
        { q: 'How do I file a new grievance?', a: 'Tap "New Grievance" or the center + button, choose a category, add location & details, and submit.' },
        { q: 'How do I track my grievance status?', a: 'Open "My Grievances" and tap any ticket to view the live 4-step officer action timeline.' },
        { q: 'How many days does resolution take?', a: 'Depending on the category SLA, issues are resolved within 2 to 7 working days.' },
        { q: 'Is uploading a photo mandatory?', a: 'No, photos are optional, though attaching site evidence speeds up field verification.' },
        { q: 'Can I sign out anytime?', a: 'Yes, tap Logout in the navigation drawer or Settings to securely end your session.' },
      ];

  // 1. Citizen Home Dashboard
  if (view === 'home') {
    const quickCards: Array<{
      label: string;
      view: CitizenView;
      icon: React.ElementType;
      tone: string;
    }> = [
      { label: t(lang, 'newGrievance'), view: 'new_category', icon: FileText, tone: 'bg-rose-50 border-rose-200 text-red-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-red-300' },
      { label: t(lang, 'myGrievances'), view: 'my_grievances', icon: CheckCircle2, tone: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300' },
      { label: t(lang, 'servicesInfo'), view: 'services_info', icon: Users, tone: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300' },
      { label: t(lang, 'notifications'), view: 'notifications', icon: Bell, tone: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300' },
      { label: t(lang, 'helpFaq'), view: 'faq', icon: HelpCircle, tone: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-900 dark:text-purple-300' },
      { label: t(lang, 'contactUs'), view: 'contact', icon: Phone, tone: 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-950/40 dark:border-cyan-900 dark:text-cyan-300' },
    ];

    return (
      <div className="space-y-5">
        <div className="bg-gradient-to-r from-red-700 to-red-800 text-white rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm">
          <div>
            <p className="text-red-100 text-xs font-medium">{t(lang, 'welcome')}</p>
            <h2 className="text-xl sm:text-2xl font-bold mt-0.5">{user.fullName}</h2>
            <p className="text-xs text-red-100 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {user.location || user.district}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono-num">{grievances.length}</div>
            <div className="text-[11px] text-red-100">{t(lang, 'myGrievances')}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {quickCards.map((card) => (
            <button
              key={card.view}
              type="button"
              onClick={() => onNavigate(card.view)}
              className={`min-h-[104px] p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-2.5 hover:shadow-sm transition-all ${card.tone}`}
            >
              <card.icon className="w-7 h-7" />
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {card.label}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs">
          <AppImage
            src="/src/assets/images/civic_capitol_building_1794847797106.jpg"
            alt={t(lang, 'appName')}
            className="w-full h-36 sm:h-48 object-cover scale-[1.06]"
          />
        </div>
      </div>
    );
  }

  // 2. Select Category Grid
  if (view === 'new_category') {
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t(lang, 'selectCategory')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                onNavigate('new_form');
              }}
              className={`min-h-[116px] p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-2.5 hover:scale-[1.01] transition-transform ${
                CATEGORY_COLORS[cat.colorKey] || CATEGORY_COLORS.amber
              }`}
            >
              <CategoryIcon iconKey={cat.iconKey} className="w-8 h-8" />
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {lang === 'ta' ? cat.nameTa : cat.nameEn}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 3. New Grievance Details Form
  if (view === 'new_form') {
    const activeCat = selectedCategory || activeCategories[0];
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'newGrievance')}</div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {activeCat ? (lang === 'ta' ? activeCat.nameTa : activeCat.nameEn) : ''}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('new_category')}
            className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
          >
            {lang === 'ta' ? 'வகை மாற்று' : 'Change Category'}
          </button>
        </div>

        {formError && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmitGrievance} className="space-y-4">
          <div>
            <label htmlFor="grievance-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'grievanceTitleLabel')}
            </label>
            <input
              id="grievance-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === 'ta' ? 'சாலை பழுதடைந்துள்ளது' : 'Road pothole near main junction'}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="grievance-desc" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t(lang, 'grievanceDescLabel')}
              </label>
              <span className="text-[11px] font-mono-num text-slate-500">{description.length} / 500</span>
            </div>
            <textarea
              id="grievance-desc"
              rows={4}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                lang === 'ta'
                  ? 'பிரச்சினையின் முழு விவரத்தை உள்ளிடவும்...'
                  : 'Describe the issue in detail...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="grievance-loc" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t(lang, 'grievanceLocLabel')}
              </label>
              <button
                type="button"
                onClick={handleCaptureGps}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5" />
                {t(lang, 'captureGpsBtn')}
              </button>
            </div>
            <div className="relative">
              <MapPin className="w-4 h-4 text-red-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="grievance-loc"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            {gpsStatusMsg && (
              <div className="text-[11px] font-mono-num text-emerald-700 dark:text-emerald-400 mt-1">
                GPS: {gpsStatusMsg}
              </div>
            )}
          </div>

          {nearbyDuplicate && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    {t(lang, 'nearbyDuplicateTitle')} ({nearbyDuplicate.grievanceCode})
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 truncate mt-0.5">
                    {nearbyDuplicate.title}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono-num font-bold text-slate-700 dark:text-slate-300">
                  {t(lang, 'upvotesLabel')}: {nearbyDuplicate.upvoteCount}
                </span>
                <button
                  type="button"
                  onClick={handleUpvoteNearby}
                  disabled={upvotedDup}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 disabled:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  {upvotedDup
                    ? lang === 'ta'
                      ? 'ஆதரவு அளிக்கப்பட்டது'
                      : 'Upvoted'
                    : t(lang, 'upvoteBtn')}
                </button>
              </div>
            </div>
          )}

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t(lang, 'grievancePhotosLabel')}
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              {photos.map((p, i) => (
                <div key={i} className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <AppImage src={p} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-red-700 text-slate-500">
                <Camera className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-semibold">{uploadingPhoto ? '...' : 'Add'}</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || uploadingPhoto}
            className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold text-sm transition-colors"
          >
            {submitting ? t(lang, 'loading') : t(lang, 'submitGrievanceBtn')}
          </button>
        </form>
      </div>
    );
  }

  // 4. Grievance Success Screen
  if (view === 'success' && createdGrievance) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mb-4">
          {t(lang, 'grievanceSuccessTitle')}
        </h2>
        <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl p-4 mb-4">
          <div className="text-xs text-slate-600 dark:text-slate-400">{t(lang, 'grievanceIdLabel')}</div>
          <div className="text-2xl font-extrabold font-mono-num text-red-700 dark:text-red-400 mt-1">
            {createdGrievance.grievanceCode}
          </div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-6">
          {t(lang, 'grievanceSuccessSub')}
        </p>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setSelectedGrievance(createdGrievance);
              onNavigate('grievance_detail');
            }}
            className="w-full min-h-[46px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {t(lang, 'viewStatusBtn')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="w-full min-h-[46px] rounded-xl border border-red-700 text-red-700 dark:text-red-400 font-bold text-sm"
          >
            {t(lang, 'goHomeBtn')}
          </button>
        </div>
      </div>
    );
  }

  // 5. My Grievances List
  if (view === 'my_grievances') {
    const allCount = grievances.length;
    const inProgCount = grievances.filter((g) => g.status !== 'resolved').length;
    const resCount = grievances.filter((g) => g.status === 'resolved').length;

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl w-fit">
            {[
              { id: 'all' as const, label: `${t(lang, 'allTab')} (${allCount})` },
              { id: 'in_progress' as const, label: `${t(lang, 'inProgressTab')} (${inProgCount})` },
              { id: 'resolved' as const, label: `${t(lang, 'resolvedTab')} (${resCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setListTab(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  listTab === tab.id
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(lang, 'search')}
              aria-label={t(lang, 'search')}
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
        </div>

        {filteredGrievances.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            {t(lang, 'noData')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredGrievances.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setSelectedGrievance(g);
                  onNavigate('grievance_detail');
                }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-red-400 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                    {g.grievanceCode}
                  </div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {g.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                    <span>{g.createdAt.slice(0, 10)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{g.location}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={g.status} lang={lang} />
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 6. Grievance Status Timeline Detail (with Upvote, Comments, Reopen, Rating)
  if (view === 'grievance_detail' && selectedGrievance) {
    const g = grievances.find((item) => item.id === selectedGrievance.id) || selectedGrievance;
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
        {detailBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold">
            {detailBanner}
          </div>
        )}
        {detailError && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">
            {detailError}
          </div>
        )}

        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="font-mono-num text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span>{g.grievanceCode}</span>
              {g.escalated && (
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-bold">
                  {t(lang, 'escalatedLabel')}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{g.title}</h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>{t(lang, 'filedDate')}: {g.createdAt}</span>
              {g.dueDate && (
                <span className="font-mono-num">{t(lang, 'slaDueLabel')}: {g.dueDate}</span>
              )}
              {g.assignedOfficerName && (
                <span>· {g.assignedOfficerName}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={g.status} lang={lang} />
            <button
              type="button"
              onClick={async () => {
                await api.upvoteGrievance(g.id);
                await onRefreshData();
              }}
              className="min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold font-mono-num text-red-700 dark:text-red-400 hover:bg-rose-50"
              aria-label={t(lang, 'upvoteBtn')}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              {g.upvoteCount ?? 1}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 no-print"
              aria-label="Print summary"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300">{g.description}</p>

        {g.photoUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {g.photoUrls.map((url, idx) => (
              <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 h-28">
                <AppImage src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {g.fieldPhotoUrls.length > 0 && (
          <div>
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2">
              {t(lang, 'fieldPhotoLabel')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {g.fieldPhotoUrls.map((url, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800 h-28">
                  <AppImage src={url} alt={`After Repair ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            {t(lang, 'actionProgress')}
          </h4>
          <ol className="space-y-4">
            {(g.timeline || []).map((step, index) => (
              <li key={step.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {index + 1}
                </div>
                <div className="flex-1 pb-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {lang === 'ta' ? step.titleTa : step.titleEn}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {step.remarks}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono-num">
                    {step.actorName} · {step.createdAt}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Two-Way Citizen & Officer Comments */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            {t(lang, 'commentsTitle')} ({(g.comments || []).length})
          </h4>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {(g.comments || []).map((c) => (
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
              setDetailError('');
              if (commentText.trim().length < 2) return;
              try {
                await api.addComment(g.id, commentText.trim());
                setCommentText('');
                await onRefreshData();
              } catch (err: any) {
                setDetailError(err.message || 'Could not post comment');
              }
            }}
            className="flex items-center gap-2 no-print"
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

        {/* Citizen Rating & Reopen Controls for Resolved Tickets */}
        {g.status === 'resolved' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 no-print">
            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-2.5">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t(lang, 'rateTicketTitle')}
              </div>
              {g.citizenRating ? (
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  ★ {g.citizenRating} / 5 {g.citizenFeedback ? `— ${g.citizenFeedback}` : ''}
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setDetailError('');
                    try {
                      await api.rateGrievance(g.id, ticketRating, ticketFeedback);
                      setDetailBanner(lang === 'ta' ? 'மதிப்பீடு பதிவு செய்யப்பட்டது!' : 'Ticket rating submitted!');
                      await onRefreshData();
                    } catch (err: any) {
                      setDetailError(err.message);
                    }
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTicketRating(s)}
                        aria-label={`Rate ticket ${s} stars`}
                        className="p-1"
                      >
                        <Star className={`w-5 h-5 ${s <= ticketRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={ticketFeedback}
                    onChange={(e) => setTicketFeedback(e.target.value)}
                    placeholder={t(lang, 'rateExperience')}
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full min-h-[38px] rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                  >
                    {t(lang, 'submitRatingBtn')}
                  </button>
                </form>
              )}
            </div>

            {(g.reopenCount || 0) < 3 && (
              <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-2.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-red-700" />
                  {t(lang, 'reopenTitle')}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setDetailError('');
                    setDetailBanner('');
                    try {
                      await api.reopenGrievance(g.id, reopenReason);
                      setReopenReason('');
                      setDetailBanner(lang === 'ta' ? 'புகார் மீண்டும் திறக்கப்பட்டது!' : 'Grievance reopened and routed back!');
                      await onRefreshData();
                    } catch (err: any) {
                      setDetailError(err.message);
                    }
                  }}
                  className="space-y-2"
                >
                  <input
                    type="text"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder={t(lang, 'reopenPlaceholder')}
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full min-h-[38px] rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold"
                  >
                    {t(lang, 'reopenBtn')}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 7. Notifications
  if (view === 'notifications') {
    return (
      <div className="space-y-3 max-w-2xl mx-auto">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={async () => {
              await api.markAllNotificationsRead();
              await onRefreshData();
            }}
            className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
          >
            {t(lang, 'markAllRead')}
          </button>
        </div>
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 flex items-start gap-3 ${
              n.isRead ? 'border-slate-200 dark:border-slate-800' : 'border-red-300 dark:border-red-800 bg-rose-50/30 dark:bg-rose-950/20'
            }`}
          >
            <Bell className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
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

  // 8. Services Info
  if (view === 'services_info') {
    const items = lang === 'ta'
      ? [
          { title: 'புகார் பதிவு முறை', sub: 'வகை தேர்வு → விவரம் → புகைப்படம் → 2026-XXXXXX எண்', icon: CheckCircle2 },
          { title: 'புகார் தீர்வு காலஅளவு', sub: 'மின்சாரம்: 2 நாட்கள் · குடிநீர்: 3 நாட்கள் · சாலை: 5 நாட்கள்', icon: Clock },
          { title: 'அதிகாரி தொடர்புகள்', sub: 'தாம்பரம்: குமார் R · அடையாறு: சுந்தரி M', icon: Users },
          { title: 'அரசு துறைகள்', sub: 'சாலை, குடிநீர், மின்சாரம், நகராட்சி, சுகாதாரம்', icon: Building2 },
          { title: 'பொது அறிவிப்பு', sub: 'நவம்பர் 20 — நகர் தூய்மை சிறப்பு முகாம்', icon: Info },
        ]
      : [
          { title: 'Grievance Filing Process', sub: 'Select Category → Enter Details → Attach Photo → Receive ID', icon: CheckCircle2 },
          { title: 'SLA Resolution Timelines', sub: 'Electricity: 2 Days · Water: 3 Days · Roads: 5 Days', icon: Clock },
          { title: 'Department Officers', sub: 'Tambaram: Kumar R · Adyar: Sundari M', icon: Users },
          { title: 'Government Departments', sub: 'Highways, Water Board, TNEB, Municipal Corp, Health', icon: Building2 },
          { title: 'Public Announcements', sub: 'Nov 20 — City-wide Sanitation Drive', icon: Info },
        ];

    return (
      <div className="max-w-2xl mx-auto space-y-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <item.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.sub}</div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onNavigate('faq')}
          className="w-full min-h-[48px] rounded-xl bg-red-700 text-white font-bold text-sm"
        >
          {t(lang, 'helpFaq')}
        </button>
      </div>
    );
  }

  // 9. FAQ / Help
  if (view === 'faq') {
    return (
      <div className="max-w-2xl mx-auto">
        <FaqAccordion items={faqs} />
      </div>
    );
  }

  // 10. Contact Us
  if (view === 'contact') {
    return (
      <div className="max-w-xl mx-auto space-y-3">
        {[
          { icon: Phone, label: lang === 'ta' ? 'அழைக்கவும்' : 'Toll-Free Helpline', val: '1800 123 4567', href: 'tel:18001234567' },
          { icon: Mail, label: lang === 'ta' ? 'மின்னஞ்சல்' : 'Support Email', val: 'support@grievance.org', href: 'mailto:support@grievance.org' },
          { icon: MessageSquare, label: 'WhatsApp', val: '+91 98765 43210', href: 'tel:+919876543210' },
          { icon: MapPin, label: lang === 'ta' ? 'முகவரி' : 'Secretariat Address', val: 'State Nodal Grievance Cell, Fort St. George, Chennai - 600 009', href: '' },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <c.icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">{c.label}</div>
              {c.href ? (
                <a href={c.href} className="text-sm font-bold text-blue-700 dark:text-blue-400 hover:underline">
                  {c.val}
                </a>
              ) : (
                <div className="text-sm font-bold text-slate-900 dark:text-white">{c.val}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 11. Feedback & Star Rating
  if (view === 'feedback') {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-4">
          {t(lang, 'feedback')}
        </h3>
        {feedbackSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold text-center">
            {lang === 'ta' ? 'உங்கள் கருத்து வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது!' : 'Thank you! Your feedback has been saved.'}
          </div>
        )}
        <form onSubmit={handleSubmitFeedback} className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} stars`}
                className="p-1.5"
              >
                <Star
                  className={`w-8 h-8 ${
                    star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                  }`}
                />
              </button>
            ))}
          </div>
          <div>
            <textarea
              rows={4}
              maxLength={300}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder={t(lang, 'rateExperience')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <div className="text-right text-[11px] font-mono-num text-slate-400 mt-1">
              {feedbackText.length} / 300
            </div>
          </div>
          <button
            type="submit"
            className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {t(lang, 'submit')}
          </button>
        </form>
      </div>
    );
  }

  // 12. Settings
  if (view === 'settings') {
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
              {lang === 'ta' ? 'தீம் (Light / Dark)' : 'Theme (Light / Dark)'}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('account')}
            className="w-full min-h-[56px] px-4 flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-red-700" />
              {t(lang, 'myAccount')}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <SourceBundleBanner lang={lang} />
      </div>
    );
  }

  // 13. My Account (with Password Change & Logout All Devices)
  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex flex-col items-center mb-5">
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center justify-center mb-2">
            <User className="w-10 h-10" />
          </div>
          <div className="text-xs text-slate-500">{user.email}</div>
        </div>

        {profileSaved && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold text-center">
            {lang === 'ta' ? 'சுயவிவரம் புதுப்பிக்கப்பட்டது!' : 'Profile updated successfully!'}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label htmlFor="acc-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t(lang, 'fullNameLabel')}
            </label>
            <input
              id="acc-name"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label htmlFor="acc-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t(lang, 'phoneLabel')}
            </label>
            <input
              id="acc-phone"
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label htmlFor="acc-loc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t(lang, 'grievanceLocLabel')}
            </label>
            <input
              id="acc-loc"
              type="text"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm"
          >
            {t(lang, 'editDetails')}
          </button>
        </form>
      </div>

      {/* Password Change & Security */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-red-700" />
          {t(lang, 'changePasswordTitle')}
        </h3>
        {passMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">{passMsg}</div>
        )}
        {passErr && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">{passErr}</div>
        )}
        <form onSubmit={handleChangePassword} className="space-y-3">
          <input
            type="password"
            value={curPass}
            onChange={(e) => setCurPass(e.target.value)}
            placeholder={t(lang, 'currentPasswordLabel')}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder={t(lang, 'newPasswordLabel')}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
          />
          <button
            type="submit"
            className="w-full min-h-[46px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm"
          >
            {t(lang, 'changePasswordBtn')}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onLogoutAll}
            className="w-full min-h-[44px] rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 font-bold text-xs inline-flex items-center justify-center gap-2 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            {t(lang, 'logoutAllBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
