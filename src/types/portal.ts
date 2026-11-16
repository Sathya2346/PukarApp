export type UserRole = 'citizen' | 'officer' | 'admin';
export type OfficerSubRole = 'officer' | 'field_worker';
export type Language = 'ta' | 'en';
export type GrievanceStatus = 'new' | 'assigned' | 'in_progress' | 'resolved' | 'overdue';
export type GrievancePriority = 'high' | 'medium' | 'low';
export type AccountStatus = 'active' | 'pending' | 'blocked' | 'inactive';

export interface UserProfile {
  id: number;
  role: UserRole;
  subRole?: OfficerSubRole;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  district: string;
  area: string;
  designation: string;
  departmentId: number | null;
  departmentNameTa?: string;
  departmentNameEn?: string;
  location: string;
  status: AccountStatus;
  createdAt: string;
}

export interface Department {
  id: number;
  nameTa: string;
  nameEn: string;
  headDesignation: string;
  active: boolean;
  grievanceCount?: number;
}

export interface Category {
  id: number;
  nameTa: string;
  nameEn: string;
  iconKey: string;
  colorKey: string;
  slaDays: number;
  active: boolean;
}

export interface TimelineStep {
  id: number;
  grievanceId: number;
  stepKey: string;
  titleTa: string;
  titleEn: string;
  remarks: string;
  actorName: string;
  createdAt: string;
}

export interface GrievanceComment {
  id: number;
  grievanceId: number;
  authorId: number;
  authorName: string;
  authorRole: UserRole;
  message: string;
  createdAt: string;
}

export interface Grievance {
  id: number;
  grievanceCode: string;
  citizenId: number;
  citizenName?: string;
  citizenEmail?: string;
  categoryId: number;
  categoryNameTa?: string;
  categoryNameEn?: string;
  departmentId: number | null;
  departmentNameTa?: string;
  departmentNameEn?: string;
  title: string;
  description: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  upvoteCount?: number;
  escalated?: boolean;
  reopenCount?: number;
  citizenRating?: number | null;
  citizenFeedback?: string;
  status: GrievanceStatus;
  priority: GrievancePriority;
  assignedOfficerId: number | null;
  assignedOfficerName?: string;
  assignedWorkerId: number | null;
  assignedWorkerName?: string;
  dueDate: string | null;
  photoUrls: string[];
  fieldPhotoUrls: string[];
  fieldNotes: string;
  createdAt: string;
  updatedAt: string;
  timeline?: TimelineStep[];
  comments?: GrievanceComment[];
}

export interface NotificationItem {
  id: number;
  userId: number | null;
  roleTarget: UserRole | 'all';
  grievanceId: number | null;
  type: 'info' | 'success' | 'warning' | 'alert';
  titleTa: string;
  titleEn: string;
  messageTa: string;
  messageEn: string;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  actorId: number | null;
  actorName: string;
  actorRole: string;
  actionType: string;
  summaryTa: string;
  summaryEn: string;
  createdAt: string;
}

export interface SystemSettings {
  grievancePrefix: string;
  otpExpiryMinutes: number;
  otpMaxAttempts: number;
  allowUserRegistration: boolean;
  pushNotificationsEnabled: boolean;
  autoAssignByDepartment: boolean;
}

export interface AnalyticsSummary {
  total: number;
  newCount: number;
  assignedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  pendingCount: number;
  overdueCount: number;
  escalatedCount?: number;
  monthly: Array<{
    monthKey: string;
    labelTa: string;
    labelEn: string;
    count: number;
  }>;
  byDepartment: Array<{
    departmentId: number;
    nameTa: string;
    nameEn: string;
    total: number;
    resolved: number;
    pending: number;
  }>;
}
