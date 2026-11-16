import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db';
import { issueEmailOtp } from './server/otp';
import {
  validateEmail,
  validateGrievanceForm,
  validateRegistrationForm,
  validateOfficerForm,
  generateGrievanceCode,
  canTransitionStatus,
  evaluateOtpCheck,
  computeStatusCounts,
  validateResolutionProof,
  canCitizenReopen,
  findNearbyDuplicateGrievance,
  selectLeastLoadedOfficer,
  isSlaBreached,
  checkRateLimitWindow,
} from './src/utils/grievanceLogic';
import type { GrievanceStatus, UserProfile } from './src/types/portal';

const execFileAsync = promisify(execFile);

initDatabase();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

interface AuthedRequest extends Request {
  user?: UserProfile;
  authToken?: string;
}

// ---------- Real-Time SSE Client Registry ----------
interface SseClient {
  id: string;
  userId: number;
  role: string;
  res: Response;
}

const sseClients = new Map<string, SseClient>();

function broadcastRealtimeEvent(eventName: string, payload: Record<string, unknown>) {
  const dataStr = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients.values()) {
    try {
      client.res.write(dataStr);
    } catch {
      sseClients.delete(client.id);
    }
  }
}

function mapUserRow(row: any): UserProfile {
  return {
    id: row.id,
    role: row.role,
    subRole: row.sub_role || 'officer',
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    phone: row.phone || '',
    district: row.district || '',
    area: row.area || '',
    designation: row.designation || '',
    departmentId: row.department_id ?? null,
    departmentNameTa: row.department_name_ta || '',
    departmentNameEn: row.department_name_en || '',
    location: row.location || '',
    status: row.status,
    createdAt: row.created_at,
  };
}

function getUserById(id: number): UserProfile | null {
  const row = db
    .prepare(
      `SELECT u.*, d.name_ta as department_name_ta, d.name_en as department_name_en
       FROM users u LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`
    )
    .get(id);
  return row ? mapUserRow(row) : null;
}

function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

function addActivityLog(
  actor: { id: number | null; name: string; role: string },
  actionType: string,
  summaryTa: string,
  summaryEn: string
) {
  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, actor_role, action_type, summary_ta, summary_en)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actor.id, actor.name, actor.role, actionType, summaryTa, summaryEn);
}

function checkAndRecordRateLimit(rateKey: string, maxAttempts = 8, windowMs = 15 * 60 * 1000) {
  const nowMs = Date.now();
  const row = db
    .prepare('SELECT attempts, window_start FROM rate_limits WHERE rate_key = ?')
    .get(rateKey) as { attempts: number; window_start: number } | undefined;

  const check = checkRateLimitWindow({
    attempts: row?.attempts ?? 0,
    windowStartMs: row?.window_start ?? nowMs,
    nowMs,
    maxAttempts,
    windowMs,
  });

  if (check.allowed) {
    db.prepare('INSERT OR REPLACE INTO rate_limits (rate_key, attempts, window_start) VALUES (?, ?, ?)').run(
      rateKey,
      check.nextAttempts,
      check.nextWindowStart
    );
  }
  return check;
}

function clearRateLimit(rateKey: string) {
  db.prepare('DELETE FROM rate_limits WHERE rate_key = ?').run(rateKey);
}

function validateSessionToken(token: string): UserProfile | null {
  if (!token) return null;
  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .get(token) as { user_id: number; expires_at: number } | undefined;
  if (!session || Date.now() > session.expires_at) return null;
  const user = getUserById(session.user_id);
  if (!user || user.status === 'blocked' || user.status === 'inactive') return null;
  return user;
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const user = validateSessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required or session expired' });
    return;
  }
  req.user = user;
  req.authToken = token;
  next();
}

function requireRole(...roles: Array<'citizen' | 'officer' | 'admin'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    next();
  };
}

// ---------- Automatic SLA Breach & Escalation Engine ----------
function runSlaEscalationSweep(): { escalatedCount: number } {
  const todayIso = new Date().toISOString().slice(0, 10);
  const openRows = db
    .prepare(
      "SELECT id, grievance_code, citizen_id, assigned_officer_id, status, due_date, escalated FROM grievances WHERE status NOT IN ('resolved', 'overdue') AND due_date IS NOT NULL"
    )
    .all() as Array<{
    id: number;
    grievance_code: string;
    citizen_id: number;
    assigned_officer_id: number | null;
    status: GrievanceStatus;
    due_date: string | null;
    escalated: number;
  }>;

  let escalatedCount = 0;
  for (const g of openRows) {
    if (isSlaBreached({ status: g.status, dueDate: g.due_date, todayIso })) {
      db.prepare(
        "UPDATE grievances SET status = 'overdue', escalated = 1, updated_at = datetime('now') WHERE id = ?"
      ).run(g.id);

      db.prepare(
        `INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name)
         VALUES (?, 'overdue', 'காலக்கெடு மீறல் — உயரதிகாரிக்கு மாற்றம்', 'SLA Breached — Auto-Escalated', ?, NULL, 'SLA Engine')`
      ).run(
        g.id,
        `SLA due date (${g.due_date}) passed. Escalated to Admin & Zonal Officer.`
      );

      db.prepare(
        `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
         VALUES (NULL, 'admin', ?, 'alert', ?, ?, ?, ?)`
      ).run(
        g.id,
        `காலக்கெடு மீறல்: ${g.grievance_code}`,
        `SLA Escalation: ${g.grievance_code}`,
        `புகார் ${g.grievance_code} காலக்கெடு (${g.due_date}) தாண்டியதால் தானாக உயர்த்தப்பட்டுள்ளது.`,
        `Grievance ${g.grievance_code} breached SLA (${g.due_date}) and was escalated.`
      );

      addActivityLog(
        { id: null, name: 'SLA Escalation Engine', role: 'system' },
        'SLA_ESCALATED',
        `காலக்கெடு மீறல் எச்சரிக்கை: ${g.grievance_code}`,
        `Auto-escalated overdue grievance ${g.grievance_code}`
      );
      escalatedCount += 1;
    }
  }

  if (escalatedCount > 0) {
    broadcastRealtimeEvent('sla_escalated', { escalatedCount, at: new Date().toISOString() });
  }
  return { escalatedCount };
}

runSlaEscalationSweep();
setInterval(() => {
  try {
    runSlaEscalationSweep();
  } catch (err) {
    console.error('SLA sweep error:', err);
  }
}, 60_000);

// ---------- SSE Live Stream ----------
app.get('/api/events', (req, res) => {
  const token = String(req.query.token || '');
  const user = validateSessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid SSE session token' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = crypto.randomUUID();
  sseClients.set(clientId, { id: clientId, userId: user.id, role: user.role, res });
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, userId: user.id })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(clientId);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(clientId);
  });
});

// ---------- Multipart / Image Upload ----------
app.post('/api/uploads', authMiddleware, (req: AuthedRequest, res) => {
  const { dataUrl, filename = 'photo.jpg' } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    res.status(400).json({ error: 'Image dataUrl is required' });
    return;
  }
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are allowed' });
    return;
  }
  const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    res.status(413).json({ error: 'Image size exceeds 5 MB limit' });
    return;
  }
  const safeBase = path.basename(String(filename).replace(/[^a-zA-Z0-9_-]/g, ''), path.extname(filename)) || 'upload';
  const outName = `${safeBase}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, outName), buffer);
  res.status(201).json({ url: `/uploads/${outName}` });
});

// ---------- Bootstrap & Health ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'makkal-pugar-api' });
});

app.get('/api/bootstrap', (_req, res) => {
  const categories = db
    .prepare('SELECT id, name_ta as nameTa, name_en as nameEn, icon_key as iconKey, color_key as colorKey, sla_days as slaDays, active FROM categories ORDER BY id ASC')
    .all()
    .map((c: any) => ({ ...c, active: Boolean(c.active) }));

  const departments = db
    .prepare(
      `SELECT d.id, d.name_ta as nameTa, d.name_en as nameEn, d.head_designation as headDesignation, d.active,
       (SELECT COUNT(*) FROM grievances g WHERE g.department_id = d.id) as grievanceCount
       FROM departments d ORDER BY d.id ASC`
    )
    .all()
    .map((d: any) => ({ ...d, active: Boolean(d.active) }));

  const settings = {
    grievancePrefix: getSetting('grievance_prefix', '2026'),
    otpExpiryMinutes: Number(getSetting('otp_expiry_minutes', '5')),
    otpMaxAttempts: Number(getSetting('otp_max_attempts', '5')),
    allowUserRegistration: getSetting('allow_user_registration', 'true') === 'true',
    pushNotificationsEnabled: getSetting('push_notifications_enabled', 'true') === 'true',
    autoAssignByDepartment: getSetting('auto_assign_by_department', 'true') === 'true',
  };

  res.json({ categories, departments, settings });
});

// ---------- Authentication, Rate Limiting & Email OTP ----------
app.post('/api/auth/login', async (req, res) => {
  const { identifier, password, role } = req.body || {};
  if (!identifier || !password || !role) {
    res.status(400).json({ error: 'Email/username, password, and role are required' });
    return;
  }

  const normalized = String(identifier).trim().toLowerCase();
  const rateKey = `login:${req.ip}:${normalized}`;
  const limitCheck = checkAndRecordRateLimit(rateKey, 8, 15 * 60 * 1000);
  if (!limitCheck.allowed) {
    res.status(429).json({
      error: `Too many login attempts. Please wait ${limitCheck.retryAfterSeconds}s and try again.`,
    });
    return;
  }

  const userRow = db
    .prepare('SELECT * FROM users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND role = ?')
    .get(normalized, normalized, role) as any;

  if (!userRow) {
    res.status(401).json({ error: 'Invalid credentials for selected role' });
    return;
  }

  if (userRow.status === 'blocked') {
    res.status(403).json({ error: 'Account has been blocked by administrator' });
    return;
  }
  if (userRow.status === 'inactive') {
    res.status(403).json({ error: 'Officer account is currently inactive' });
    return;
  }
  if (userRow.status === 'pending') {
    res.status(403).json({ error: 'Account is awaiting administrator approval' });
    return;
  }

  const passwordValid = bcrypt.compareSync(String(password), userRow.password_hash);
  if (!passwordValid) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  clearRateLimit(rateKey);

  const otpResult = await issueEmailOtp({
    email: userRow.email,
    role,
    purpose: 'login',
  });

  if (!otpResult.success) {
    res.status(429).json({
      error: otpResult.error,
      cooldownSecondsRemaining: otpResult.cooldownSecondsRemaining,
    });
    return;
  }

  res.json({
    otpRequired: true,
    email: userRow.email,
    role,
    expiresInSeconds: otpResult.expiresInSeconds,
    deliveryMode: otpResult.deliveryMode,
    devOtpHint: otpResult.devOtpHint,
  });
});

app.post('/api/auth/register', async (req, res) => {
  if (getSetting('allow_user_registration', 'true') !== 'true') {
    res.status(403).json({ error: 'New citizen registration is currently disabled by administrator' });
    return;
  }

  const { fullName, email, phone, district, area, password, role = 'citizen' } = req.body || {};
  const validation = validateRegistrationForm({
    fullName: String(fullName || ''),
    email: String(email || ''),
    phone: phone ? String(phone) : '',
    district: String(district || ''),
    area: String(area || ''),
    password: String(password || ''),
  });

  if (!validation.valid) {
    res.status(400).json({ error: 'Validation failed', fields: validation.errors });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const safeRole = role === 'officer' ? 'officer' : 'citizen';
  const username = `${normalizedEmail.split('@')[0]}.${Math.floor(100 + Math.random() * 899)}`;
  const passwordHash = bcrypt.hashSync(String(password), 10);
  const initialStatus = safeRole === 'officer' ? 'pending' : 'active';

  const result = db
    .prepare(
      `INSERT INTO users (role, sub_role, full_name, username, email, phone, password_hash, district, area, location, status)
       VALUES (?, 'officer', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      safeRole,
      String(fullName).trim(),
      username,
      normalizedEmail,
      String(phone || '').trim(),
      passwordHash,
      String(district).trim(),
      String(area).trim(),
      `${String(area).trim()}, ${String(district).trim()}`,
      initialStatus
    );

  addActivityLog(
    { id: Number(result.lastInsertRowid), name: String(fullName).trim(), role: safeRole },
    'USER_REGISTERED',
    `புதிய பயனர் பதிவு: ${String(fullName).trim()} (${normalizedEmail})`,
    `New user registered: ${String(fullName).trim()} (${normalizedEmail})`
  );

  const otpResult = await issueEmailOtp({
    email: normalizedEmail,
    role: safeRole,
    purpose: 'register',
  });

  res.status(201).json({
    otpRequired: true,
    email: normalizedEmail,
    role: safeRole,
    pendingApproval: safeRole === 'officer',
    expiresInSeconds: otpResult.expiresInSeconds,
    deliveryMode: otpResult.deliveryMode,
    devOtpHint: otpResult.devOtpHint,
  });
});

app.post('/api/auth/request-otp', async (req, res) => {
  const { email, role = 'citizen', purpose = 'login' } = req.body || {};
  if (!email || !validateEmail(String(email))) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const userRow = db
    .prepare('SELECT id, status FROM users WHERE LOWER(email) = ? AND role = ?')
    .get(normalizedEmail, role) as { id: number; status: string } | undefined;

  if (!userRow) {
    res.status(404).json({ error: 'No account found with this email for the selected role' });
    return;
  }
  if (userRow.status === 'blocked' || userRow.status === 'inactive') {
    res.status(403).json({ error: 'Account is disabled or blocked' });
    return;
  }

  const otpResult = await issueEmailOtp({
    email: normalizedEmail,
    role,
    purpose,
  });

  if (!otpResult.success) {
    res.status(429).json({
      error: otpResult.error,
      cooldownSecondsRemaining: otpResult.cooldownSecondsRemaining,
    });
    return;
  }

  res.json({
    success: true,
    email: normalizedEmail,
    expiresInSeconds: otpResult.expiresInSeconds,
    deliveryMode: otpResult.deliveryMode,
    devOtpHint: otpResult.devOtpHint,
  });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { email, role, code } = req.body || {};
  if (!email || !role || !code) {
    res.status(400).json({ error: 'Email, role, and 6-digit OTP code are required' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const otpRow = db
    .prepare('SELECT * FROM otp_tokens WHERE email = ? AND role = ? ORDER BY id DESC LIMIT 1')
    .get(normalizedEmail, role) as any;

  if (!otpRow) {
    res.status(400).json({ error: 'No active OTP found. Please request a new OTP.' });
    return;
  }

  const maxAttempts = Number(getSetting('otp_max_attempts', '5'));
  const check = evaluateOtpCheck({
    storedCode: otpRow.code,
    inputCode: String(code),
    expiresAtMs: otpRow.expires_at,
    nowMs: Date.now(),
    attempts: otpRow.attempts,
    maxAttempts,
    consumed: Boolean(otpRow.consumed),
  });

  if (!check.ok) {
    if (check.reason === 'mismatch' || check.reason === 'invalid_format') {
      db.prepare('UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
    }
    const reasonMessages: Record<string, string> = {
      consumed: 'This OTP has already been used. Request a new code.',
      locked: 'Too many invalid OTP attempts. Please request a new code.',
      expired: 'OTP has expired. Please request a new code.',
      invalid_format: 'OTP must be a 6-digit number.',
      mismatch: 'Incorrect OTP code. Please check your email and try again.',
    };
    res.status(400).json({ error: reasonMessages[check.reason || 'mismatch'], reason: check.reason });
    return;
  }

  db.prepare('UPDATE otp_tokens SET consumed = 1 WHERE id = ?').run(otpRow.id);

  const userRow = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ? AND role = ?')
    .get(normalizedEmail, role) as any;

  if (!userRow) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (userRow.status === 'pending') {
    res.status(200).json({
      verified: true,
      pendingApproval: true,
      message: 'Email verified. Your account is pending administrator approval.',
    });
    return;
  }
  if (userRow.status !== 'active') {
    res.status(403).json({ error: 'Account is blocked or inactive' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userRow.id,
    now,
    expiresAt
  );

  const user = getUserById(userRow.id)!;
  addActivityLog(
    { id: user.id, name: user.fullName, role: user.role },
    'LOGIN',
    `உள்நுழைவு (${user.role}): ${user.email}`,
    `User signed in via Email OTP: ${user.email}`
  );

  res.json({ verified: true, token, user });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, role, code, newPassword } = req.body || {};
  if (!email || !role || !code || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: 'Valid email, OTP code, and password (min 6 chars) are required' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const otpRow = db
    .prepare('SELECT * FROM otp_tokens WHERE email = ? AND role = ? ORDER BY id DESC LIMIT 1')
    .get(normalizedEmail, role) as any;

  if (!otpRow) {
    res.status(400).json({ error: 'No active OTP found' });
    return;
  }

  const check = evaluateOtpCheck({
    storedCode: otpRow.code,
    inputCode: String(code),
    expiresAtMs: otpRow.expires_at,
    nowMs: Date.now(),
    attempts: otpRow.attempts,
    maxAttempts: Number(getSetting('otp_max_attempts', '5')),
    consumed: Boolean(otpRow.consumed),
  });

  if (!check.ok) {
    db.prepare('UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
    res.status(400).json({ error: 'Invalid or expired OTP code' });
    return;
  }

  db.prepare('UPDATE otp_tokens SET consumed = 1 WHERE id = ?').run(otpRow.id);
  const hash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE LOWER(email) = ? AND role = ?').run(
    hash,
    normalizedEmail,
    role
  );

  res.json({ success: true });
});

app.post('/api/auth/change-password', authMiddleware, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: 'Current password and new password (min 6 chars) are required' });
    return;
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
  if (!bcrypt.compareSync(String(currentPassword), row.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    req.user!.id
  );
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'PASSWORD_CHANGED',
    `கடவுச்சொல் மாற்றப்பட்டது: ${req.user!.fullName}`,
    `Password changed by ${req.user!.email}`
  );
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

app.patch('/api/auth/profile', authMiddleware, (req: AuthedRequest, res) => {
  const { fullName, phone, location, district, area } = req.body || {};
  if (!fullName || String(fullName).trim().length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters' });
    return;
  }
  db.prepare(
    'UPDATE users SET full_name = ?, phone = ?, location = ?, district = ?, area = ? WHERE id = ?'
  ).run(
    String(fullName).trim(),
    String(phone ?? req.user!.phone).trim(),
    String(location ?? req.user!.location).trim(),
    String(district ?? req.user!.district).trim(),
    String(area ?? req.user!.area).trim(),
    req.user!.id
  );
  res.json({ user: getUserById(req.user!.id) });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthedRequest, res) => {
  if (req.authToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  }
  res.json({ success: true });
});

app.post('/api/auth/logout-all', authMiddleware, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

// ---------- Grievances, GPS Nearby Check, Auto-Assignment, Comments, Reopen & Rating ----------
function enrichGrievances(rows: any[]) {
  return rows.map((r) => {
    const timeline = db
      .prepare(
        `SELECT id, grievance_id as grievanceId, step_key as stepKey, title_ta as titleTa, title_en as titleEn,
         remarks, actor_name as actorName, created_at as createdAt
         FROM grievance_timeline WHERE grievance_id = ? ORDER BY id ASC`
      )
      .all(r.id);

    const comments = db
      .prepare(
        `SELECT id, grievance_id as grievanceId, author_id as authorId, author_name as authorName,
         author_role as authorRole, message, created_at as createdAt
         FROM grievance_comments WHERE grievance_id = ? ORDER BY id ASC`
      )
      .all(r.id);

    return {
      id: r.id,
      grievanceCode: r.grievance_code,
      citizenId: r.citizen_id,
      citizenName: r.citizen_name,
      citizenEmail: r.citizen_email,
      categoryId: r.category_id,
      categoryNameTa: r.category_name_ta,
      categoryNameEn: r.category_name_en,
      departmentId: r.department_id,
      departmentNameTa: r.department_name_ta,
      departmentNameEn: r.department_name_en,
      title: r.title,
      description: r.description,
      location: r.location,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      upvoteCount: r.upvote_count ?? 1,
      escalated: Boolean(r.escalated),
      reopenCount: r.reopen_count ?? 0,
      citizenRating: r.citizen_rating ?? null,
      citizenFeedback: r.citizen_feedback || '',
      status: r.status,
      priority: r.priority,
      assignedOfficerId: r.assigned_officer_id,
      assignedOfficerName: r.assigned_officer_name || '',
      assignedWorkerId: r.assigned_worker_id,
      assignedWorkerName: r.assigned_worker_name || '',
      dueDate: r.due_date,
      photoUrls: JSON.parse(r.photo_urls || '[]'),
      fieldPhotoUrls: JSON.parse(r.field_photo_urls || '[]'),
      fieldNotes: r.field_notes || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      timeline,
      comments,
    };
  });
}

app.get('/api/grievances/nearby', authMiddleware, (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const categoryId = Number(req.query.categoryId);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(categoryId)) {
    res.json({ duplicate: null });
    return;
  }

  const candidates = db
    .prepare(
      'SELECT id, grievance_code as grievanceCode, category_id as categoryId, status, latitude, longitude, title, upvote_count as upvoteCount FROM grievances WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
    )
    .all() as any[];

  const match = findNearbyDuplicateGrievance({ categoryId, latitude: lat, longitude: lng }, candidates, 150);
  res.json({ duplicate: match });
});

app.get('/api/grievances', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const statusFilter = req.query.status ? String(req.query.status) : '';
  const search = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
  const scopeAll = req.query.scope === 'all';

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (user.role === 'citizen') {
    whereClause += ' AND g.citizen_id = ?';
    params.push(user.id);
  } else if (user.role === 'officer' && !scopeAll) {
    if (user.subRole === 'field_worker') {
      whereClause += ' AND g.assigned_worker_id = ?';
      params.push(user.id);
    } else if (user.departmentId) {
      whereClause += ' AND (g.department_id = ? OR g.assigned_officer_id = ? OR g.assigned_worker_id = ?)';
      params.push(user.departmentId, user.id, user.id);
    }
  }

  if (statusFilter && statusFilter !== 'all') {
    whereClause += ' AND g.status = ?';
    params.push(statusFilter);
  }
  if (search) {
    whereClause += ' AND (LOWER(g.grievance_code) LIKE ? OR LOWER(g.title) LIKE ? OR LOWER(g.location) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const rows = db
    .prepare(
      `SELECT g.*,
        c.full_name as citizen_name, c.email as citizen_email,
        cat.name_ta as category_name_ta, cat.name_en as category_name_en,
        d.name_ta as department_name_ta, d.name_en as department_name_en,
        off.full_name as assigned_officer_name,
        wrk.full_name as assigned_worker_name
       FROM grievances g
       LEFT JOIN users c ON g.citizen_id = c.id
       LEFT JOIN categories cat ON g.category_id = cat.id
       LEFT JOIN departments d ON g.department_id = d.id
       LEFT JOIN users off ON g.assigned_officer_id = off.id
       LEFT JOIN users wrk ON g.assigned_worker_id = wrk.id
       ${whereClause}
       ORDER BY g.id DESC`
    )
    .all(...params);

  res.json({ grievances: enrichGrievances(rows) });
});

app.post('/api/grievances', authMiddleware, (req: AuthedRequest, res) => {
  const {
    categoryId,
    title,
    description,
    location,
    latitude = null,
    longitude = null,
    photoUrls = [],
    priority = 'medium',
  } = req.body || {};

  const validation = validateGrievanceForm({
    categoryId: Number(categoryId),
    title: String(title || ''),
    description: String(description || ''),
    location: String(location || ''),
  });

  if (!validation.valid) {
    res.status(400).json({ error: 'Please complete all required grievance fields', fields: validation.errors });
    return;
  }

  const cat = db.prepare('SELECT id, name_ta, name_en, sla_days FROM categories WHERE id = ?').get(Number(categoryId)) as any;
  if (!cat) {
    res.status(400).json({ error: 'Selected category does not exist' });
    return;
  }

  const deptId = Math.min(Number(categoryId), 6);
  const seq = Number(getSetting('grievance_sequence', '1245')) + 1;
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(
    'grievance_sequence',
    String(seq)
  );
  const prefix = getSetting('grievance_prefix', '2026');
  const code = generateGrievanceCode(prefix, seq);

  const safePhotos = Array.isArray(photoUrls) ? photoUrls.slice(0, 4) : [];
  const safePriority = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';

  // Calculate SLA Due Date
  const dueDt = new Date(Date.now() + (Number(cat.sla_days) || 5) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Smart Least-Loaded Auto-Assignment
  let assignedOfficerId: number | null = null;
  let initialStatus: GrievanceStatus = 'new';
  if (getSetting('auto_assign_by_department', 'true') === 'true') {
    const officers = db
      .prepare("SELECT id, department_id as departmentId, status, sub_role as subRole FROM users WHERE role = 'officer'")
      .all() as any[];
    const openGrievances = db
      .prepare('SELECT assigned_officer_id as assignedOfficerId, status FROM grievances')
      .all() as any[];
    assignedOfficerId = selectLeastLoadedOfficer(officers, openGrievances, deptId);
    if (assignedOfficerId) {
      initialStatus = 'assigned';
    }
  }

  const latNum = typeof latitude === 'number' && Number.isFinite(latitude) ? latitude : null;
  const lngNum = typeof longitude === 'number' && Number.isFinite(longitude) ? longitude : null;

  const result = db
    .prepare(
      `INSERT INTO grievances (
         grievance_code, citizen_id, category_id, department_id, title, description, location,
         latitude, longitude, upvote_count, status, priority, assigned_officer_id, due_date,
         photo_urls, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      code,
      req.user!.id,
      cat.id,
      deptId,
      String(title).trim(),
      String(description).trim(),
      String(location).trim(),
      latNum,
      lngNum,
      initialStatus,
      safePriority,
      assignedOfficerId,
      dueDt,
      JSON.stringify(safePhotos)
    );

  const grievanceId = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name)
     VALUES (?, 'submitted', 'புகார் பதிவு செய்யப்பட்டது', 'Grievance Submitted', ?, ?, ?)`
  ).run(grievanceId, String(description).trim().slice(0, 120), req.user!.id, req.user!.fullName);

  if (assignedOfficerId) {
    const off = getUserById(assignedOfficerId);
    db.prepare(
      `INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name)
       VALUES (?, 'assigned', 'தானியங்கி அதிகாரி ஒதுக்கீடு', 'Auto-Assigned to Officer', ?, ?, 'Routing Engine')`
    ).run(grievanceId, `Auto-assigned to ${off?.fullName || 'Department Officer'} (SLA: ${dueDt})`, assignedOfficerId);

    db.prepare(
      `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
       VALUES (?, 'officer', ?, 'warning', ?, ?, ?, ?)`
    ).run(
      assignedOfficerId,
      grievanceId,
      `புதிய தானியங்கி ஒதுக்கீடு ${code}`,
      `Auto-Assigned Grievance ${code}`,
      `${String(location).trim()} பகுதி புகார் உங்களுக்கு ஒதுக்கப்பட்டுள்ளது (காலக்கெடு: ${dueDt}).`,
      `New grievance from ${String(location).trim()} routed to your queue (Due: ${dueDt}).`
    );
  }

  db.prepare(
    `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
     VALUES (?, 'citizen', ?, 'success', ?, ?, ?, ?)`
  ).run(
    req.user!.id,
    grievanceId,
    `புகார் ${code} பதிவு செய்யப்பட்டது`,
    `Grievance ${code} Registered`,
    `உங்கள் புகார் "${String(title).trim()}" வெற்றிகரமாக பதிவு செய்யப்பட்டது.`,
    `Your grievance "${String(title).trim()}" has been logged.`
  );

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'GRIEVANCE_CREATED',
    `புதிய புகார் பதிவு: ${code} (${cat.name_ta})`,
    `Grievance created: ${code} (${cat.name_en})`
  );

  broadcastRealtimeEvent('grievance_created', { grievanceCode: code, grievanceId });

  const createdRow = db
    .prepare(
      `SELECT g.*, c.full_name as citizen_name, c.email as citizen_email,
       cat.name_ta as category_name_ta, cat.name_en as category_name_en,
       d.name_ta as department_name_ta, d.name_en as department_name_en,
       off.full_name as assigned_officer_name, wrk.full_name as assigned_worker_name
       FROM grievances g
       LEFT JOIN users c ON g.citizen_id = c.id
       LEFT JOIN categories cat ON g.category_id = cat.id
       LEFT JOIN departments d ON g.department_id = d.id
       LEFT JOIN users off ON g.assigned_officer_id = off.id
       LEFT JOIN users wrk ON g.assigned_worker_id = wrk.id
       WHERE g.id = ?`
    )
    .get(grievanceId);

  res.status(201).json({ grievance: enrichGrievances([createdRow])[0] });
});

app.post('/api/grievances/:id/upvote', authMiddleware, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const g = db.prepare('SELECT id, grievance_code FROM grievances WHERE id = ?').get(id) as any;
  if (!g) {
    res.status(404).json({ error: 'Grievance not found' });
    return;
  }
  const existing = db
    .prepare('SELECT 1 FROM grievance_upvotes WHERE grievance_id = ? AND user_id = ?')
    .get(id, req.user!.id);
  if (!existing) {
    db.prepare('INSERT INTO grievance_upvotes (grievance_id, user_id) VALUES (?, ?)').run(id, req.user!.id);
    db.prepare('UPDATE grievances SET upvote_count = upvote_count + 1 WHERE id = ?').run(id);
    broadcastRealtimeEvent('grievance_updated', { grievanceId: id });
  }
  const updated = db.prepare('SELECT upvote_count as upvoteCount FROM grievances WHERE id = ?').get(id) as { upvoteCount: number };
  res.json({ success: true, upvoteCount: updated.upvoteCount });
});

app.post('/api/grievances/:id/comments', authMiddleware, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { message } = req.body || {};
  if (!message || String(message).trim().length < 2) {
    res.status(400).json({ error: 'Comment message cannot be empty' });
    return;
  }
  const g = db.prepare('SELECT id, citizen_id, assigned_officer_id, grievance_code FROM grievances WHERE id = ?').get(id) as any;
  if (!g) {
    res.status(404).json({ error: 'Grievance not found' });
    return;
  }
  if (req.user!.role === 'citizen' && g.citizen_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only comment on your own grievances' });
    return;
  }

  db.prepare(
    `INSERT INTO grievance_comments (grievance_id, author_id, author_name, author_role, message)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.user!.id, req.user!.fullName, req.user!.role, String(message).trim().slice(0, 400));

  const targetRole = req.user!.role === 'citizen' ? 'officer' : 'citizen';
  const targetUserId = req.user!.role === 'citizen' ? g.assigned_officer_id : g.citizen_id;

  db.prepare(
    `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
     VALUES (?, ?, ?, 'info', ?, ?, ?, ?)`
  ).run(
    targetUserId,
    targetRole,
    id,
    `புதிய கருத்து: ${g.grievance_code}`,
    `New Comment on ${g.grievance_code}`,
    `${req.user!.fullName}: ${String(message).trim().slice(0, 80)}`,
    `${req.user!.fullName}: ${String(message).trim().slice(0, 80)}`
  );

  broadcastRealtimeEvent('comment_added', { grievanceId: id });
  res.status(201).json({ success: true });
});

app.post('/api/grievances/:id/reopen', authMiddleware, requireRole('citizen'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body || {};
  const g = db.prepare('SELECT * FROM grievances WHERE id = ?').get(id) as any;
  if (!g || g.citizen_id !== req.user!.id) {
    res.status(404).json({ error: 'Grievance not found' });
    return;
  }
  if (!canCitizenReopen(g.status, g.reopen_count)) {
    res.status(400).json({ error: 'Only resolved grievances (up to 3 appeals) can be reopened' });
    return;
  }
  if (!reason || String(reason).trim().length < 5) {
    res.status(400).json({ error: 'Please provide a reason (min 5 chars) to reopen this grievance' });
    return;
  }

  db.prepare(
    "UPDATE grievances SET status = 'in_progress', reopen_count = reopen_count + 1, updated_at = datetime('now') WHERE id = ?"
  ).run(id);

  db.prepare(
    `INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name)
     VALUES (?, 'reopened', 'புகார் மீண்டும் திறக்கப்பட்டது', 'Reopened by Citizen', ?, ?, ?)`
  ).run(id, String(reason).trim(), req.user!.id, req.user!.fullName);

  db.prepare(
    `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
     VALUES (?, 'officer', ?, 'alert', ?, ?, ?, ?)`
  ).run(
    g.assigned_officer_id,
    id,
    `புகார் மீண்டும் திறப்பு: ${g.grievance_code}`,
    `Grievance Reopened: ${g.grievance_code}`,
    String(reason).trim(),
    String(reason).trim()
  );

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: 'citizen' },
    'GRIEVANCE_REOPENED',
    `புகார் மீண்டும் திறக்கப்பட்டது: ${g.grievance_code}`,
    `Citizen reopened grievance ${g.grievance_code}`
  );

  broadcastRealtimeEvent('grievance_updated', { grievanceId: id });
  res.json({ success: true });
});

app.post('/api/grievances/:id/rate', authMiddleware, requireRole('citizen'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { rating, feedback = '' } = req.body || {};
  const g = db.prepare('SELECT id, citizen_id, status FROM grievances WHERE id = ?').get(id) as any;
  if (!g || g.citizen_id !== req.user!.id) {
    res.status(404).json({ error: 'Grievance not found' });
    return;
  }
  if (g.status !== 'resolved') {
    res.status(400).json({ error: 'You can rate a grievance after it is resolved' });
    return;
  }
  const num = Number(rating);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    res.status(400).json({ error: 'Rating must be between 1 and 5' });
    return;
  }
  db.prepare('UPDATE grievances SET citizen_rating = ?, citizen_feedback = ? WHERE id = ?').run(
    num,
    String(feedback).trim().slice(0, 300),
    id
  );
  broadcastRealtimeEvent('grievance_updated', { grievanceId: id });
  res.json({ success: true });
});

app.patch('/api/grievances/:id/assign', authMiddleware, requireRole('officer', 'admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { officerId, workerId, priority, dueDate, note } = req.body || {};
  const existing = db.prepare('SELECT * FROM grievances WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Grievance not found' });
    return;
  }

  const nextOfficerId = officerId ? Number(officerId) : existing.assigned_officer_id;
  const nextWorkerId = workerId ? Number(workerId) : existing.assigned_worker_id;
  const nextPriority = ['high', 'medium', 'low'].includes(priority) ? priority : existing.priority;
  const nextDue = dueDate ? String(dueDate) : existing.due_date;

  db.prepare(
    `UPDATE grievances
     SET assigned_officer_id = ?, assigned_worker_id = ?, priority = ?, due_date = ?,
         status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextOfficerId, nextWorkerId, nextPriority, nextDue, id);

  const assignee = getUserById(nextWorkerId || nextOfficerId || req.user!.id);
  const assigneeName = assignee ? assignee.fullName : 'Officer';

  db.prepare(
    `INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name)
     VALUES (?, 'assigned', 'பணி ஒதுக்கப்பட்டது', 'Work Assigned', ?, ?, ?)`
  ).run(
    id,
    note ? String(note).trim() : `Assigned to ${assigneeName}`,
    req.user!.id,
    req.user!.fullName
  );

  db.prepare(
    `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
     VALUES (?, 'citizen', ?, 'info', ?, ?, ?, ?)`
  ).run(
    existing.citizen_id,
    id,
    `புகார் ${existing.grievance_code} ஒதுக்கப்பட்டது`,
    `Grievance ${existing.grievance_code} Assigned`,
    `உங்கள் புகார் ${assigneeName} அவர்களுக்கு ஒதுக்கப்பட்டுள்ளது.`,
    `Your grievance has been assigned to ${assigneeName}.`
  );

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'GRIEVANCE_ASSIGNED',
    `புகார் ஒதுக்கப்பட்டது: ${existing.grievance_code} → ${assigneeName}`,
    `Assigned grievance ${existing.grievance_code} to ${assigneeName}`
  );

  broadcastRealtimeEvent('grievance_updated', { grievanceId: id });

  const updated = db
    .prepare(
      `SELECT g.*, c.full_name as citizen_name, c.email as citizen_email,
       cat.name_ta as category_name_ta, cat.name_en as category_name_en,
       d.name_ta as department_name_ta, d.name_en as department_name_en,
       off.full_name as assigned_officer_name, wrk.full_name as assigned_worker_name
       FROM grievances g
       LEFT JOIN users c ON g.citizen_id = c.id
       LEFT JOIN categories cat ON g.category_id = cat.id
       LEFT JOIN departments d ON g.department_id = d.id
       LEFT JOIN users off ON g.assigned_officer_id = off.id
       LEFT JOIN users wrk ON g.assigned_worker_id = wrk.id
       WHERE g.id = ?`
    )
    .get(id);

  res.json({ grievance: enrichGrievances([updated])[0] });
});

app.patch('/api/grievances/:id/status', authMiddleware, requireRole('officer', 'admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { status, remarks = '', fieldPhotoUrls } = req.body || {};
  const existing = db.prepare('SELECT * FROM grievances WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Grievance not found' });
    return;
  }

  const nextStatus = String(status) as GrievanceStatus;
  if (!['new', 'assigned', 'in_progress', 'resolved', 'overdue'].includes(nextStatus)) {
    res.status(400).json({ error: 'Invalid grievance status' });
    return;
  }

  if (!canTransitionStatus(existing.status, nextStatus)) {
    res.status(400).json({ error: `Cannot transition from ${existing.status} to ${nextStatus}` });
    return;
  }

  const existingFieldPhotos = JSON.parse(existing.field_photo_urls || '[]');
  const nextFieldPhotos = Array.isArray(fieldPhotoUrls) ? fieldPhotoUrls.slice(0, 4) : existingFieldPhotos;

  // Proof-of-Resolution Gate
  const proofCheck = validateResolutionProof({
    nextStatus,
    fieldPhotoUrls: nextFieldPhotos,
    remarks: String(remarks || existing.field_notes || ''),
  });
  if (!proofCheck.ok) {
    res.status(400).json({
      error:
        proofCheck.reason === 'photo_required'
          ? 'At least 1 after-repair field photo is required before marking a grievance as Resolved.'
          : 'Detailed resolution remarks (minimum 10 characters) are required before marking Resolved.',
    });
    return;
  }

  db.prepare(
    `UPDATE grievances
     SET status = ?, escalated = CASE WHEN ? = 'resolved' THEN 0 ELSE escalated END,
         field_notes = COALESCE(NULLIF(?, ''), field_notes),
         field_photo_urls = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextStatus, String(remarks).trim(), JSON.stringify(nextFieldPhotos), id);

  const labelMap: Record<GrievanceStatus, [string, string]> = {
    new: ['புதிய புகார்', 'New'],
    assigned: ['அதிகாரிக்கு ஒதுக்கப்பட்டது', 'Assigned'],
    in_progress: ['நடவடிக்கை நடைபெறுகிறது', 'Action In Progress'],
    resolved: ['தீர்வு செய்யப்பட்டது', 'Resolved'],
    overdue: ['காலதாமதம்', 'Overdue'],
  };

  const [titleTa, titleEn] = labelMap[nextStatus];
  db.prepare(
    `INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, nextStatus, titleTa, titleEn, String(remarks).trim() || titleEn, req.user!.id, req.user!.fullName);

  db.prepare(
    `INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en)
     VALUES (?, 'citizen', ?, ?, ?, ?, ?, ?)`
  ).run(
    existing.citizen_id,
    id,
    nextStatus === 'resolved' ? 'success' : 'info',
    `புகார் ${existing.grievance_code} — ${titleTa}`,
    `Grievance ${existing.grievance_code} — ${titleEn}`,
    String(remarks).trim() || titleTa,
    String(remarks).trim() || titleEn
  );

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'STATUS_UPDATED',
    `நிலை மாற்றம் (${existing.grievance_code}): ${titleTa}`,
    `Status updated (${existing.grievance_code}): ${titleEn}`
  );

  broadcastRealtimeEvent('grievance_updated', { grievanceId: id, status: nextStatus });

  const updated = db
    .prepare(
      `SELECT g.*, c.full_name as citizen_name, c.email as citizen_email,
       cat.name_ta as category_name_ta, cat.name_en as category_name_en,
       d.name_ta as department_name_ta, d.name_en as department_name_en,
       off.full_name as assigned_officer_name, wrk.full_name as assigned_worker_name
       FROM grievances g
       LEFT JOIN users c ON g.citizen_id = c.id
       LEFT JOIN categories cat ON g.category_id = cat.id
       LEFT JOIN departments d ON g.department_id = d.id
       LEFT JOIN users off ON g.assigned_officer_id = off.id
       LEFT JOIN users wrk ON g.assigned_worker_id = wrk.id
       WHERE g.id = ?`
    )
    .get(id);

  res.json({ grievance: enrichGrievances([updated])[0] });
});

// ---------- Notifications & Feedback ----------
app.get('/api/notifications', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const rows = db
    .prepare(
      `SELECT id, user_id as userId, role_target as roleTarget, grievance_id as grievanceId,
       type, title_ta as titleTa, title_en as titleEn, message_ta as messageTa, message_en as messageEn,
       is_read as isRead, created_at as createdAt
       FROM notifications
       WHERE user_id = ? OR (user_id IS NULL AND (role_target = ? OR role_target = 'all'))
       ORDER BY id DESC LIMIT 40`
    )
    .all(user.id, user.role)
    .map((n: any) => ({ ...n, isRead: Boolean(n.isRead) }));

  res.json({ notifications: rows });
});

app.patch('/api/notifications/read-all', authMiddleware, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR (user_id IS NULL AND role_target = ?)').run(
    req.user!.id,
    req.user!.role
  );
  res.json({ success: true });
});

app.post('/api/feedback', authMiddleware, (req: AuthedRequest, res) => {
  const { rating, comment = '' } = req.body || {};
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    res.status(400).json({ error: 'Please select a star rating between 1 and 5' });
    return;
  }
  db.prepare('INSERT INTO feedbacks (user_id, rating, comment) VALUES (?, ?, ?)').run(
    req.user!.id,
    numericRating,
    String(comment).trim().slice(0, 300)
  );
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'FEEDBACK_SUBMITTED',
    `கருத்து சமர்ப்பிக்கப்பட்டது (${numericRating}/5 நட்சத்திரம்)`,
    `Feedback submitted (${numericRating}/5 stars)`
  );
  res.status(201).json({ success: true });
});

// ---------- Team / Officer / Admin Management ----------
app.get('/api/staff', authMiddleware, requireRole('officer', 'admin'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, d.name_ta as department_name_ta, d.name_en as department_name_en
       FROM users u LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.role = 'officer' AND u.status != 'pending'
       ORDER BY u.id DESC`
    )
    .all();
  res.json({ officers: rows.map(mapUserRow) });
});

app.post('/api/admin/officers', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const { fullName, email, phone, designation, departmentId, location, subRole = 'officer' } = req.body || {};
  const validation = validateOfficerForm({
    fullName: String(fullName || ''),
    email: String(email || ''),
    phone: String(phone || ''),
    designation: String(designation || ''),
    departmentId: Number(departmentId),
    location: String(location || ''),
  });

  if (!validation.valid) {
    res.status(400).json({ error: 'Invalid officer details', fields: validation.errors });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (exists) {
    res.status(409).json({ error: 'Officer email already exists' });
    return;
  }

  const username = `${normalizedEmail.split('@')[0]}.${Math.floor(100 + Math.random() * 899)}`;
  const hash = bcrypt.hashSync('Password@123', 10);
  const safeSubRole = subRole === 'field_worker' ? 'field_worker' : 'officer';

  const result = db
    .prepare(
      `INSERT INTO users (role, sub_role, full_name, username, email, phone, password_hash, designation, department_id, location, status)
       VALUES ('officer', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
    )
    .run(
      safeSubRole,
      String(fullName).trim(),
      username,
      normalizedEmail,
      String(phone).trim(),
      hash,
      String(designation).trim(),
      Number(departmentId),
      String(location).trim()
    );

  const officer = getUserById(Number(result.lastInsertRowid));
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'OFFICER_CREATED',
    `புதிய அதிகாரி உருவாக்கப்பட்டது: ${String(fullName).trim()}`,
    `New officer created: ${String(fullName).trim()}`
  );
  res.status(201).json({ officer });
});

app.patch('/api/admin/officers/:id', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { designation, departmentId, location, status, phone, fullName } = req.body || {};
  const existing = getUserById(id);
  if (!existing || existing.role !== 'officer') {
    res.status(404).json({ error: 'Officer not found' });
    return;
  }

  db.prepare(
    `UPDATE users SET full_name = ?, phone = ?, designation = ?, department_id = ?, location = ?, status = ? WHERE id = ?`
  ).run(
    fullName ? String(fullName).trim() : existing.fullName,
    phone ? String(phone).trim() : existing.phone,
    designation ? String(designation).trim() : existing.designation,
    departmentId ? Number(departmentId) : existing.departmentId,
    location ? String(location).trim() : existing.location,
    status && ['active', 'inactive', 'blocked'].includes(status) ? status : existing.status,
    id
  );

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'OFFICER_UPDATED',
    `அதிகாரி விவரம் திருத்தப்பட்டது: ${existing.fullName}`,
    `Officer updated: ${existing.fullName}`
  );
  res.json({ officer: getUserById(id) });
});

app.delete('/api/admin/officers/:id', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = getUserById(id);
  if (!existing || existing.role !== 'officer') {
    res.status(404).json({ error: 'Officer not found' });
    return;
  }
  db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(id);
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'OFFICER_DEACTIVATED',
    `அதிகாரி நீக்கப்பட்டது: ${existing.fullName}`,
    `Officer deactivated: ${existing.fullName}`
  );
  res.json({ success: true });
});

app.post('/api/admin/officers/:id/reset-password', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = getUserById(id);
  if (!existing) {
    res.status(404).json({ error: 'Officer not found' });
    return;
  }
  const tempPass = 'Temp@2026';
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(tempPass, 10), id);
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'PASSWORD_RESET',
    `கடவுச்சொல் மீட்டமைப்பு: ${existing.fullName}`,
    `Password reset for ${existing.fullName}`
  );
  res.json({ success: true, temporaryPassword: tempPass });
});

app.post('/api/admin/run-sla-check', authMiddleware, requireRole('admin'), (_req, res) => {
  const result = runSlaEscalationSweep();
  res.json(result);
});

app.get('/api/admin/approvals', authMiddleware, requireRole('admin'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, d.name_ta as department_name_ta, d.name_en as department_name_en
       FROM users u LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.status = 'pending' ORDER BY u.id DESC`
    )
    .all();
  res.json({ pendingUsers: rows.map(mapUserRow) });
});

app.post('/api/admin/approvals/:id/decision', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { decision } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'Decision must be approve or reject' });
    return;
  }
  const target = getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const nextStatus = decision === 'approve' ? 'active' : 'blocked';
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(nextStatus, id);

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    decision === 'approve' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
    `${target.fullName} ஒப்புதல் ${decision === 'approve' ? 'வழங்கப்பட்டது' : 'நிராகரிக்கப்பட்டது'}`,
    `${target.fullName} request ${decision === 'approve' ? 'approved' : 'rejected'}`
  );
  broadcastRealtimeEvent('approval_decided', { userId: id, decision });
  res.json({ success: true });
});

app.get('/api/admin/users', authMiddleware, requireRole('admin'), (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM users WHERE role = 'citizen' AND status != 'pending' ORDER BY id DESC")
    .all();
  res.json({ users: rows.map(mapUserRow) });
});

app.patch('/api/admin/users/:id/status', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'blocked'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const target = getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'USER_STATUS_CHANGED',
    `பயனர் நிலை மாற்றம்: ${target.fullName} → ${status}`,
    `Citizen ${target.fullName} status set to ${status}`
  );
  res.json({ user: getUserById(id) });
});

app.post('/api/admin/departments', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const { nameTa, nameEn, headDesignation = '' } = req.body || {};
  if (!nameTa || !nameEn) {
    res.status(400).json({ error: 'Tamil and English department names are required' });
    return;
  }
  const r = db
    .prepare('INSERT INTO departments (name_ta, name_en, head_designation, active) VALUES (?, ?, ?, 1)')
    .run(String(nameTa).trim(), String(nameEn).trim(), String(headDesignation).trim());
  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'DEPT_CREATED',
    `புதிய துறை சேர்க்கப்பட்டது: ${String(nameTa).trim()}`,
    `Department added: ${String(nameEn).trim()}`
  );
  res.status(201).json({ id: r.lastInsertRowid });
});

app.delete('/api/admin/departments/:id', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/admin/categories', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const { nameTa, nameEn, iconKey = 'other', colorKey = 'slate', slaDays = 7 } = req.body || {};
  if (!nameTa || !nameEn) {
    res.status(400).json({ error: 'Category names are required' });
    return;
  }
  const r = db
    .prepare('INSERT INTO categories (name_ta, name_en, icon_key, color_key, sla_days, active) VALUES (?, ?, ?, ?, ?, 1)')
    .run(String(nameTa).trim(), String(nameEn).trim(), iconKey, colorKey, Number(slaDays) || 7);
  res.status(201).json({ id: r.lastInsertRowid });
});

app.patch('/api/admin/categories/:id', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { active } = req.body || {};
  db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  res.json({ success: true });
});

app.get('/api/admin/logs', authMiddleware, requireRole('admin'), (_req, res) => {
  const logs = db
    .prepare(
      `SELECT id, actor_id as actorId, actor_name as actorName, actor_role as actorRole,
       action_type as actionType, summary_ta as summaryTa, summary_en as summaryEn, created_at as createdAt
       FROM activity_logs ORDER BY id DESC LIMIT 100`
    )
    .all();
  res.json({ logs });
});

app.patch('/api/admin/settings', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const {
    grievancePrefix,
    otpExpiryMinutes,
    otpMaxAttempts,
    allowUserRegistration,
    pushNotificationsEnabled,
    autoAssignByDepartment,
  } = req.body || {};

  const upsert = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
  if (grievancePrefix) upsert.run('grievance_prefix', String(grievancePrefix).trim());
  if (otpExpiryMinutes) upsert.run('otp_expiry_minutes', String(Number(otpExpiryMinutes)));
  if (otpMaxAttempts) upsert.run('otp_max_attempts', String(Number(otpMaxAttempts)));
  if (typeof allowUserRegistration === 'boolean') upsert.run('allow_user_registration', String(allowUserRegistration));
  if (typeof pushNotificationsEnabled === 'boolean') upsert.run('push_notifications_enabled', String(pushNotificationsEnabled));
  if (typeof autoAssignByDepartment === 'boolean') upsert.run('auto_assign_by_department', String(autoAssignByDepartment));

  addActivityLog(
    { id: req.user!.id, name: req.user!.fullName, role: req.user!.role },
    'SETTINGS_UPDATED',
    'கணினி அமைப்புகள் புதுப்பிக்கப்பட்டன',
    'System settings updated'
  );
  res.json({ success: true });
});

app.get('/api/admin/backup', authMiddleware, requireRole('admin'), (_req, res) => {
  const grievances = db.prepare('SELECT * FROM grievances').all();
  const users = db.prepare('SELECT id, role, sub_role, full_name, username, email, phone, district, area, designation, department_id, location, status, created_at FROM users').all();
  const departments = db.prepare('SELECT * FROM departments').all();
  const categories = db.prepare('SELECT * FROM categories').all();
  res.json({
    exportedAt: new Date().toISOString(),
    grievances,
    users,
    departments,
    categories,
  });
});

// ---------- Analytics ----------
app.get('/api/analytics', authMiddleware, (_req, res) => {
  const all = db.prepare('SELECT id, status, department_id, escalated, created_at FROM grievances').all() as Array<{
    id: number;
    status: GrievanceStatus;
    department_id: number | null;
    escalated: number;
    created_at: string;
  }>;

  const counts = computeStatusCounts(all);
  const escalatedCount = all.filter((g) => Boolean(g.escalated)).length;

  const monthNames = [
    { key: '2026-06', ta: 'ஜூன்', en: 'Jun' },
    { key: '2026-07', ta: 'ஜூலை', en: 'Jul' },
    { key: '2026-08', ta: 'ஆக.', en: 'Aug' },
    { key: '2026-09', ta: 'செப்.', en: 'Sep' },
    { key: '2026-10', ta: 'அக்.', en: 'Oct' },
    { key: '2026-11', ta: 'நவ.', en: 'Nov' },
  ];

  const monthly = monthNames.map((m) => ({
    monthKey: m.key,
    labelTa: m.ta,
    labelEn: m.en,
    count: all.filter((g) => g.created_at.startsWith(m.key)).length,
  }));

  const depts = db.prepare('SELECT id, name_ta, name_en FROM departments ORDER BY id ASC').all() as Array<{
    id: number;
    name_ta: string;
    name_en: string;
  }>;

  const byDepartment = depts.map((d) => {
    const items = all.filter((g) => g.department_id === d.id);
    const resolved = items.filter((g) => g.status === 'resolved').length;
    return {
      departmentId: d.id,
      nameTa: d.name_ta,
      nameEn: d.name_en,
      total: items.length,
      resolved,
      pending: items.length - resolved,
    };
  });

  res.json({
    ...counts,
    escalatedCount,
    monthly,
    byDepartment,
  });
});

// ---------- Export Expo + Django + MySQL Zip Bundle ----------
app.get('/api/export-bundle', async (_req, res) => {
  const bundleDir = path.resolve(process.cwd(), 'project_bundle');
  if (!fs.existsSync(bundleDir)) {
    res.status(404).json({ error: 'Source bundle directory not found' });
    return;
  }

  const zipPath = path.resolve(os.tmpdir(), 'makkal-pugar-expo-django-mysql.zip');
  try {
    await execFileAsync('python3', [
      '-c',
      `import shutil, sys; shutil.make_archive(sys.argv[1][:-4], 'zip', sys.argv[2])`,
      zipPath,
      bundleDir,
    ]);
    res.download(zipPath, 'makkal-pugar-expo-django-mysql.zip');
  } catch (err) {
    console.error('Zip generation failed:', err);
    res.status(500).json({ error: 'Failed to generate zip archive' });
  }
});

// ---------- Start Server + Vite Middleware ----------
async function start() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Makkal Pugar Portal running on http://localhost:${PORT}`);
  });
}

start();
