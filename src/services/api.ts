import type {
  ActivityLog,
  AnalyticsSummary,
  Category,
  Department,
  Grievance,
  NotificationItem,
  SystemSettings,
  UserProfile,
  UserRole,
} from '../types/portal';

const TOKEN_KEY = 'mps_auth_token';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const errMsg = data?.error || `Request failed (${res.status})`;
    const error = new Error(errMsg) as Error & { fields?: Record<string, string>; status?: number };
    error.fields = data?.fields;
    error.status = res.status;
    throw error;
  }

  return data as T;
}

export const api = {
  bootstrap: () =>
    apiFetch<{ categories: Category[]; departments: Department[]; settings: SystemSettings }>('/api/bootstrap'),

  login: (identifier: string, password: string, role: UserRole) =>
    apiFetch<{
      otpRequired: boolean;
      email: string;
      role: UserRole;
      expiresInSeconds: number;
      deliveryMode: 'smtp' | 'sandbox';
      devOtpHint?: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, role }),
    }),

  register: (payload: {
    fullName: string;
    email: string;
    phone?: string;
    district: string;
    area: string;
    password: string;
    role?: UserRole;
  }) =>
    apiFetch<{
      otpRequired: boolean;
      email: string;
      role: UserRole;
      pendingApproval: boolean;
      expiresInSeconds: number;
      deliveryMode: 'smtp' | 'sandbox';
      devOtpHint?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestOtp: (email: string, role: UserRole, purpose: 'login' | 'register' | 'reset_password' = 'login') =>
    apiFetch<{
      success: boolean;
      email: string;
      expiresInSeconds: number;
      deliveryMode: 'smtp' | 'sandbox';
      devOtpHint?: string;
    }>('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email, role, purpose }),
    }),

  verifyOtp: (email: string, role: UserRole, code: string) =>
    apiFetch<{
      verified: boolean;
      pendingApproval?: boolean;
      message?: string;
      token?: string;
      user?: UserProfile;
    }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, role, code }),
    }),

  resetPassword: (email: string, role: UserRole, code: string, newPassword: string) =>
    apiFetch<{ success: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, role, code, newPassword }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  me: () => apiFetch<{ user: UserProfile }>('/api/auth/me'),

  updateProfile: (payload: Partial<UserProfile>) =>
    apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  logout: () => apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  logoutAll: () => apiFetch<{ success: boolean }>('/api/auth/logout-all', { method: 'POST' }),

  uploadImage: (dataUrl: string, filename = 'photo.jpg') =>
    apiFetch<{ url: string }>('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename }),
    }),

  listGrievances: (status = 'all', q = '', scope: 'assigned' | 'all' = 'assigned') => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (q) params.set('q', q);
    if (scope === 'all') params.set('scope', 'all');
    const qs = params.toString();
    return apiFetch<{ grievances: Grievance[] }>(`/api/grievances${qs ? `?${qs}` : ''}`);
  },

  checkNearbyDuplicate: (lat: number, lng: number, categoryId: number) =>
    apiFetch<{
      duplicate: {
        id: number;
        grievanceCode: string;
        title: string;
        status: string;
        upvoteCount: number;
      } | null;
    }>(`/api/grievances/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&categoryId=${encodeURIComponent(categoryId)}`),

  createGrievance: (payload: {
    categoryId: number;
    title: string;
    description: string;
    location: string;
    latitude?: number | null;
    longitude?: number | null;
    photoUrls?: string[];
    priority?: string;
  }) =>
    apiFetch<{ grievance: Grievance }>('/api/grievances', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  upvoteGrievance: (id: number) =>
    apiFetch<{ success: boolean; upvoteCount: number }>(`/api/grievances/${id}/upvote`, {
      method: 'POST',
    }),

  addComment: (id: number, message: string) =>
    apiFetch<{ success: boolean }>(`/api/grievances/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  reopenGrievance: (id: number, reason: string) =>
    apiFetch<{ success: boolean }>(`/api/grievances/${id}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  rateGrievance: (id: number, rating: number, feedback = '') =>
    apiFetch<{ success: boolean }>(`/api/grievances/${id}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    }),

  assignGrievance: (
    id: number,
    payload: { officerId?: number; workerId?: number; priority?: string; dueDate?: string; note?: string }
  ) =>
    apiFetch<{ grievance: Grievance }>(`/api/grievances/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updateGrievanceStatus: (
    id: number,
    payload: { status: string; remarks: string; fieldPhotoUrls?: string[] }
  ) =>
    apiFetch<{ grievance: Grievance }>(`/api/grievances/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  listNotifications: () => apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
  markAllNotificationsRead: () => apiFetch<{ success: boolean }>('/api/notifications/read-all', { method: 'PATCH' }),

  submitFeedback: (rating: number, comment: string) =>
    apiFetch<{ success: boolean }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),

  listStaff: () => apiFetch<{ officers: UserProfile[] }>('/api/staff'),

  createOfficer: (payload: {
    fullName: string;
    email: string;
    phone: string;
    designation: string;
    departmentId: number;
    location: string;
    subRole?: 'officer' | 'field_worker';
  }) =>
    apiFetch<{ officer: UserProfile }>('/api/admin/officers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateOfficer: (id: number, payload: Partial<UserProfile>) =>
    apiFetch<{ officer: UserProfile }>(`/api/admin/officers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteOfficer: (id: number) => apiFetch<{ success: boolean }>(`/api/admin/officers/${id}`, { method: 'DELETE' }),

  resetOfficerPassword: (id: number) =>
    apiFetch<{ success: boolean; temporaryPassword: string }>(`/api/admin/officers/${id}/reset-password`, {
      method: 'POST',
    }),

  runSlaCheck: () =>
    apiFetch<{ escalatedCount: number }>('/api/admin/run-sla-check', {
      method: 'POST',
    }),

  listApprovals: () => apiFetch<{ pendingUsers: UserProfile[] }>('/api/admin/approvals'),
  decideApproval: (id: number, decision: 'approve' | 'reject') =>
    apiFetch<{ success: boolean }>(`/api/admin/approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  listUsers: () => apiFetch<{ users: UserProfile[] }>('/api/admin/users'),
  setUserStatus: (id: number, status: 'active' | 'blocked') =>
    apiFetch<{ user: UserProfile }>(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  createDepartment: (payload: { nameTa: string; nameEn: string; headDesignation?: string }) =>
    apiFetch<{ id: number }>('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteDepartment: (id: number) =>
    apiFetch<{ success: boolean }>(`/api/admin/departments/${id}`, { method: 'DELETE' }),

  createCategory: (payload: { nameTa: string; nameEn: string; slaDays?: number }) =>
    apiFetch<{ id: number }>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleCategory: (id: number, active: boolean) =>
    apiFetch<{ success: boolean }>(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),

  listLogs: () => apiFetch<{ logs: ActivityLog[] }>('/api/admin/logs'),

  updateSettings: (payload: Partial<SystemSettings>) =>
    apiFetch<{ success: boolean }>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  downloadBackup: () => apiFetch<Record<string, unknown>>('/api/admin/backup'),
  getAnalytics: () => apiFetch<AnalyticsSummary>('/api/analytics'),
};
