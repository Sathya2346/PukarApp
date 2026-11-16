import type { Grievance, GrievanceStatus, UserProfile } from '../types/portal';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^(\+91[\s-]?)?[6-9]\d{9}$/;
const OTP_REGEX = /^\d{6}$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validatePhone(phone: string): boolean {
  const cleaned = phone.trim().replace(/\s+/g, '');
  if (!cleaned) return false;
  return PHONE_REGEX.test(cleaned);
}

export function validateOtpFormat(code: string): boolean {
  return OTP_REGEX.test(code.trim());
}

export function validatePasswordStrength(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

export function validateGrievanceForm(input: {
  title: string;
  description: string;
  location: string;
  categoryId: number | null;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  const description = input.description.trim();
  const location = input.location.trim();

  if (!input.categoryId || input.categoryId <= 0) {
    errors.categoryId = 'category_required';
  }
  if (title.length < 5 || title.length > 120) {
    errors.title = 'title_invalid';
  }
  if (description.length < 10 || description.length > 500) {
    errors.description = 'description_invalid';
  }
  if (location.length < 3 || location.length > 160) {
    errors.location = 'location_invalid';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateRegistrationForm(input: {
  fullName: string;
  email: string;
  phone?: string;
  district: string;
  area: string;
  password: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (input.fullName.trim().length < 2) {
    errors.fullName = 'name_required';
  }
  if (!validateEmail(input.email)) {
    errors.email = 'email_invalid';
  }
  if (input.phone && input.phone.trim().length > 0 && !validatePhone(input.phone)) {
    errors.phone = 'phone_invalid';
  }
  if (!input.district.trim()) {
    errors.district = 'district_required';
  }
  if (!input.area.trim()) {
    errors.area = 'area_required';
  }
  if (!validatePasswordStrength(input.password)) {
    errors.password = 'password_weak';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateOfficerForm(input: {
  fullName: string;
  email: string;
  phone: string;
  designation: string;
  departmentId: number | null;
  location: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (input.fullName.trim().length < 2) {
    errors.fullName = 'name_required';
  }
  if (!validateEmail(input.email)) {
    errors.email = 'email_invalid';
  }
  if (!validatePhone(input.phone)) {
    errors.phone = 'phone_invalid';
  }
  if (!input.designation.trim()) {
    errors.designation = 'designation_required';
  }
  if (!input.departmentId || input.departmentId <= 0) {
    errors.departmentId = 'department_required';
  }
  if (input.location.trim().length < 2) {
    errors.location = 'location_required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function generateGrievanceCode(prefix: string, sequence: number): string {
  const safePrefix = prefix.trim() || '2026';
  const padded = String(Math.max(1, sequence)).padStart(6, '0');
  return `${safePrefix}-${padded}`;
}

const ALLOWED_TRANSITIONS: Record<GrievanceStatus, GrievanceStatus[]> = {
  new: ['assigned', 'in_progress', 'resolved', 'overdue'],
  assigned: ['in_progress', 'resolved', 'overdue'],
  in_progress: ['resolved', 'overdue', 'assigned'],
  overdue: ['assigned', 'in_progress', 'resolved'],
  resolved: ['in_progress'],
};

export function canTransitionStatus(
  currentStatus: GrievanceStatus,
  nextStatus: GrievanceStatus
): boolean {
  if (currentStatus === nextStatus) return true;
  return ALLOWED_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

export function validateResolutionProof(params: {
  nextStatus: GrievanceStatus;
  fieldPhotoUrls: string[];
  remarks: string;
}): { ok: boolean; reason?: 'photo_required' | 'remarks_required' } {
  if (params.nextStatus !== 'resolved') {
    return { ok: true };
  }
  if (!params.fieldPhotoUrls || params.fieldPhotoUrls.length === 0) {
    return { ok: false, reason: 'photo_required' };
  }
  if (params.remarks.trim().length < 10) {
    return { ok: false, reason: 'remarks_required' };
  }
  return { ok: true };
}

export function canCitizenReopen(status: GrievanceStatus, reopenCount = 0): boolean {
  return status === 'resolved' && reopenCount < 3;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function findNearbyDuplicateGrievance<
  T extends Pick<Grievance, 'id' | 'grievanceCode' | 'categoryId' | 'status' | 'latitude' | 'longitude' | 'title'>
>(
  candidate: { categoryId: number; latitude: number; longitude: number },
  existing: T[],
  maxMeters = 150
): (T & { distanceMeters: number }) | null {
  for (const g of existing) {
    if (g.status === 'resolved') continue;
    if (g.categoryId !== candidate.categoryId) continue;
    if (typeof g.latitude !== 'number' || typeof g.longitude !== 'number') continue;
    const dist = haversineDistanceMeters(candidate.latitude, candidate.longitude, g.latitude, g.longitude);
    if (dist <= maxMeters) {
      return { ...g, distanceMeters: dist };
    }
  }
  return null;
}

export function selectLeastLoadedOfficer(
  officers: Array<Pick<UserProfile, 'id' | 'departmentId' | 'status' | 'subRole'>>,
  openGrievances: Array<Pick<Grievance, 'assignedOfficerId' | 'status'>>,
  departmentId: number
): number | null {
  const eligible = officers.filter(
    (o) => o.status === 'active' && o.subRole !== 'field_worker' && o.departmentId === departmentId
  );
  const pool =
    eligible.length > 0
      ? eligible
      : officers.filter((o) => o.status === 'active' && o.subRole !== 'field_worker');

  if (pool.length === 0) return null;

  const loadMap = new Map<number, number>();
  for (const o of pool) loadMap.set(o.id, 0);

  for (const g of openGrievances) {
    if (g.status !== 'resolved' && g.assignedOfficerId && loadMap.has(g.assignedOfficerId)) {
      loadMap.set(g.assignedOfficerId, (loadMap.get(g.assignedOfficerId) || 0) + 1);
    }
  }

  let bestId = pool[0].id;
  let minLoad = loadMap.get(bestId) ?? 0;
  for (const o of pool) {
    const load = loadMap.get(o.id) ?? 0;
    if (load < minLoad) {
      minLoad = load;
      bestId = o.id;
    }
  }
  return bestId;
}

export function isSlaBreached(params: {
  status: GrievanceStatus;
  dueDate: string | null;
  todayIso: string;
}): boolean {
  if (params.status === 'resolved' || params.status === 'overdue') return false;
  if (!params.dueDate) return false;
  return params.dueDate < params.todayIso;
}

export function evaluateOtpCheck(params: {
  storedCode: string;
  inputCode: string;
  expiresAtMs: number;
  nowMs: number;
  attempts: number;
  maxAttempts: number;
  consumed: boolean;
}): { ok: boolean; reason?: 'consumed' | 'locked' | 'expired' | 'invalid_format' | 'mismatch' } {
  if (params.consumed) {
    return { ok: false, reason: 'consumed' };
  }
  if (params.attempts >= params.maxAttempts) {
    return { ok: false, reason: 'locked' };
  }
  if (params.nowMs > params.expiresAtMs) {
    return { ok: false, reason: 'expired' };
  }
  if (!validateOtpFormat(params.inputCode)) {
    return { ok: false, reason: 'invalid_format' };
  }
  if (params.storedCode.trim() !== params.inputCode.trim()) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

export function checkRateLimitWindow(params: {
  attempts: number;
  windowStartMs: number;
  nowMs: number;
  maxAttempts: number;
  windowMs: number;
}): { allowed: boolean; nextAttempts: number; nextWindowStart: number; retryAfterSeconds: number } {
  if (params.nowMs - params.windowStartMs > params.windowMs) {
    return {
      allowed: true,
      nextAttempts: 1,
      nextWindowStart: params.nowMs,
      retryAfterSeconds: 0,
    };
  }
  if (params.attempts >= params.maxAttempts) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((params.windowMs - (params.nowMs - params.windowStartMs)) / 1000)
    );
    return {
      allowed: false,
      nextAttempts: params.attempts,
      nextWindowStart: params.windowStartMs,
      retryAfterSeconds,
    };
  }
  return {
    allowed: true,
    nextAttempts: params.attempts + 1,
    nextWindowStart: params.windowStartMs,
    retryAfterSeconds: 0,
  };
}

export function computeStatusCounts(grievances: Pick<Grievance, 'status'>[]) {
  let newCount = 0;
  let assignedCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;
  let overdueCount = 0;

  for (const g of grievances) {
    switch (g.status) {
      case 'new':
        newCount += 1;
        break;
      case 'assigned':
        assignedCount += 1;
        break;
      case 'in_progress':
        inProgressCount += 1;
        break;
      case 'resolved':
        resolvedCount += 1;
        break;
      case 'overdue':
        overdueCount += 1;
        break;
    }
  }

  const total = grievances.length;
  const pendingCount = newCount + assignedCount + overdueCount;
  const activeWorkCount = assignedCount + inProgressCount;

  return {
    total,
    newCount,
    assignedCount,
    inProgressCount,
    resolvedCount,
    overdueCount,
    pendingCount,
    activeWorkCount,
  };
}
