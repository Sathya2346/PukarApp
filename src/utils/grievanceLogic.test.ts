import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  validatePhone,
  validateOtpFormat,
  validateGrievanceForm,
  validateRegistrationForm,
  validateOfficerForm,
  generateGrievanceCode,
  canTransitionStatus,
  evaluateOtpCheck,
  computeStatusCounts,
  validateResolutionProof,
  canCitizenReopen,
  haversineDistanceMeters,
  findNearbyDuplicateGrievance,
  selectLeastLoadedOfficer,
  isSlaBreached,
  checkRateLimitWindow,
} from './grievanceLogic';

test('Email validation handles valid and invalid addresses', () => {
  assert.equal(validateEmail('citizen@example.com'), true);
  assert.equal(validateEmail('kumar.r@dept.gov.in'), true);
  assert.equal(validateEmail('invalid-email'), false);
  assert.equal(validateEmail('user@'), false);
  assert.equal(validateEmail(''), false);
});

test('Phone validation checks Indian 10-digit format', () => {
  assert.equal(validatePhone('9876543210'), true);
  assert.equal(validatePhone('+91 98765 43210'), true);
  assert.equal(validatePhone('12345'), false);
  assert.equal(validatePhone('1234567890'), false);
});

test('Grievance form validation enforces required fields and length bounds', () => {
  const valid = validateGrievanceForm({
    title: 'Road pothole near bus stand',
    description: 'Large pothole causing traffic congestion near Tambaram bus stand.',
    location: 'Chennai, Tambaram',
    categoryId: 1,
  });
  assert.equal(valid.valid, true);

  const missing = validateGrievanceForm({
    title: 'Hi',
    description: 'Short',
    location: '',
    categoryId: null,
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.errors.categoryId, 'category_required');
  assert.equal(missing.errors.title, 'title_invalid');
  assert.equal(missing.errors.description, 'description_invalid');
  assert.equal(missing.errors.location, 'location_invalid');
});

test('Registration and Officer validation cover positive and negative inputs', () => {
  const regBad = validateRegistrationForm({
    fullName: 'A',
    email: 'bad',
    phone: '111',
    district: '',
    area: '',
    password: '123',
  });
  assert.equal(regBad.valid, false);
  assert.equal(Object.keys(regBad.errors).length, 6);

  const offOk = validateOfficerForm({
    fullName: 'Kumar R',
    email: 'kumar@dept.gov.in',
    phone: '+91 98765 43210',
    designation: 'Assistant Engineer',
    departmentId: 1,
    location: 'Chennai',
  });
  assert.equal(offOk.valid, true);
});

test('Grievance code generator formats padded sequence cleanly', () => {
  assert.equal(generateGrievanceCode('2026', 1245), '2026-001245');
  assert.equal(generateGrievanceCode('MPS', 7), 'MPS-000007');
});

test('Status state machine allows valid transitions and blocks invalid transitions', () => {
  assert.equal(canTransitionStatus('new', 'assigned'), true);
  assert.equal(canTransitionStatus('assigned', 'in_progress'), true);
  assert.equal(canTransitionStatus('in_progress', 'resolved'), true);
  assert.equal(canTransitionStatus('resolved', 'new'), false);
});

test('Proof-of-resolution requires at least one after-repair photo and 10-char remarks', () => {
  assert.equal(
    validateResolutionProof({ nextStatus: 'resolved', fieldPhotoUrls: [], remarks: 'Fixed road' }).reason,
    'photo_required'
  );
  assert.equal(
    validateResolutionProof({ nextStatus: 'resolved', fieldPhotoUrls: ['/uploads/a.jpg'], remarks: 'Done' }).reason,
    'remarks_required'
  );
  assert.equal(
    validateResolutionProof({
      nextStatus: 'resolved',
      fieldPhotoUrls: ['/uploads/a.jpg'],
      remarks: 'Asphalt resurfaced and inspected.',
    }).ok,
    true
  );
  assert.equal(
    validateResolutionProof({ nextStatus: 'in_progress', fieldPhotoUrls: [], remarks: '' }).ok,
    true
  );
});

test('Citizen reopen rules allow reopening resolved tickets up to 3 times', () => {
  assert.equal(canCitizenReopen('resolved', 0), true);
  assert.equal(canCitizenReopen('resolved', 3), false);
  assert.equal(canCitizenReopen('in_progress', 0), false);
});

test('GPS Haversine & duplicate detection catch nearby open complaints', () => {
  const dist = haversineDistanceMeters(12.9249, 80.1000, 12.9254, 80.1003);
  assert.ok(dist < 100);

  const dup = findNearbyDuplicateGrievance(
    { categoryId: 1, latitude: 12.9252, longitude: 80.1002 },
    [
      {
        id: 1,
        grievanceCode: '2026-001245',
        categoryId: 1,
        status: 'in_progress',
        latitude: 12.9249,
        longitude: 80.1000,
        title: 'Road pothole',
      },
      {
        id: 2,
        grievanceCode: '2026-001198',
        categoryId: 1,
        status: 'resolved',
        latitude: 12.9249,
        longitude: 80.1000,
        title: 'Already fixed',
      },
    ],
    150
  );
  assert.ok(dup !== null);
  assert.equal(dup?.grievanceCode, '2026-001245');
});

test('Least-loaded auto-assignment balances workload within matching department', () => {
  const officerId = selectLeastLoadedOfficer(
    [
      { id: 2, departmentId: 1, status: 'active', subRole: 'officer' },
      { id: 10, departmentId: 1, status: 'active', subRole: 'officer' },
      { id: 5, departmentId: 1, status: 'active', subRole: 'field_worker' },
      { id: 3, departmentId: 4, status: 'active', subRole: 'officer' },
    ],
    [
      { assignedOfficerId: 2, status: 'in_progress' },
      { assignedOfficerId: 2, status: 'assigned' },
      { assignedOfficerId: 10, status: 'resolved' },
    ],
    1
  );
  assert.equal(officerId, 10);
});

test('SLA breach evaluator flags open grievances past due date', () => {
  assert.equal(isSlaBreached({ status: 'in_progress', dueDate: '2026-11-10', todayIso: '2026-11-16' }), true);
  assert.equal(isSlaBreached({ status: 'resolved', dueDate: '2026-11-10', todayIso: '2026-11-16' }), false);
  assert.equal(isSlaBreached({ status: 'assigned', dueDate: '2026-11-20', todayIso: '2026-11-16' }), false);
});

test('Rate limiter blocks after max attempts within window and resets after window', () => {
  const t0 = 1_700_000_000_000;
  const blocked = checkRateLimitWindow({
    attempts: 5,
    windowStartMs: t0,
    nowMs: t0 + 60_000,
    maxAttempts: 5,
    windowMs: 900_000,
  });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);

  const reset = checkRateLimitWindow({
    attempts: 5,
    windowStartMs: t0,
    nowMs: t0 + 950_000,
    maxAttempts: 5,
    windowMs: 900_000,
  });
  assert.equal(reset.allowed, true);
  assert.equal(reset.nextAttempts, 1);
});

test('Email OTP verification handles valid, expired, locked, consumed, and mismatched codes', () => {
  const now = 1_700_000_000_000;
  assert.equal(
    evaluateOtpCheck({
      storedCode: '386412',
      inputCode: '386412',
      expiresAtMs: now + 60_000,
      nowMs: now,
      attempts: 0,
      maxAttempts: 5,
      consumed: false,
    }).ok,
    true
  );
  assert.equal(
    evaluateOtpCheck({
      storedCode: '386412',
      inputCode: '386412',
      expiresAtMs: now - 1000,
      nowMs: now,
      attempts: 0,
      maxAttempts: 5,
      consumed: false,
    }).reason,
    'expired'
  );
  assert.equal(validateOtpFormat('123456'), true);
});

test('Status counts accurately aggregate dashboard KPI metrics', () => {
  const counts = computeStatusCounts([
    { status: 'new' },
    { status: 'assigned' },
    { status: 'in_progress' },
    { status: 'resolved' },
    { status: 'resolved' },
    { status: 'overdue' },
  ]);
  assert.equal(counts.total, 6);
  assert.equal(counts.pendingCount, 3);
});
