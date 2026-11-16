import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'makkal_pugar.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'officer', 'admin')),
      sub_role TEXT NOT NULL DEFAULT 'officer',
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      district TEXT DEFAULT '',
      area TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      department_id INTEGER NULL,
      location TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending', 'blocked', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'login',
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ta TEXT NOT NULL,
      name_en TEXT NOT NULL,
      head_designation TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ta TEXT NOT NULL,
      name_en TEXT NOT NULL,
      icon_key TEXT NOT NULL DEFAULT 'other',
      color_key TEXT NOT NULL DEFAULT 'slate',
      sla_days INTEGER NOT NULL DEFAULT 7,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grievance_code TEXT NOT NULL UNIQUE,
      citizen_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      department_id INTEGER NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      latitude REAL NULL,
      longitude REAL NULL,
      upvote_count INTEGER NOT NULL DEFAULT 1,
      escalated INTEGER NOT NULL DEFAULT 0,
      reopen_count INTEGER NOT NULL DEFAULT 0,
      citizen_rating INTEGER NULL,
      citizen_feedback TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'assigned', 'in_progress', 'resolved', 'overdue')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
      assigned_officer_id INTEGER NULL,
      assigned_worker_id INTEGER NULL,
      due_date TEXT NULL,
      photo_urls TEXT NOT NULL DEFAULT '[]',
      field_photo_urls TEXT NOT NULL DEFAULT '[]',
      field_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS grievance_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grievance_id INTEGER NOT NULL,
      step_key TEXT NOT NULL,
      title_ta TEXT NOT NULL,
      title_en TEXT NOT NULL,
      remarks TEXT NOT NULL DEFAULT '',
      actor_id INTEGER NULL,
      actor_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (grievance_id) REFERENCES grievances(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grievance_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grievance_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (grievance_id) REFERENCES grievances(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grievance_upvotes (
      grievance_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (grievance_id, user_id),
      FOREIGN KEY (grievance_id) REFERENCES grievances(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      role_target TEXT NOT NULL DEFAULT 'all',
      grievance_id INTEGER NULL,
      type TEXT NOT NULL DEFAULT 'info',
      title_ta TEXT NOT NULL,
      title_en TEXT NOT NULL,
      message_ta TEXT NOT NULL,
      message_en TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      summary_ta TEXT NOT NULL,
      summary_en TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL
    );
  `);

  // Safe migrations for existing persisted DBs
  ensureColumn('users', 'sub_role', "TEXT NOT NULL DEFAULT 'officer'");
  ensureColumn('grievances', 'latitude', 'REAL NULL');
  ensureColumn('grievances', 'longitude', 'REAL NULL');
  ensureColumn('grievances', 'upvote_count', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('grievances', 'escalated', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('grievances', 'reopen_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('grievances', 'citizen_rating', 'INTEGER NULL');
  ensureColumn('grievances', 'citizen_feedback', "TEXT NOT NULL DEFAULT ''");

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    seedDatabase();
  } else {
    // Ensure field workers have sub_role = 'field_worker' & sample GPS coords exist
    db.prepare("UPDATE users SET sub_role = 'field_worker' WHERE email IN ('kumaresan@field.gov.in', 'chandran@field.gov.in')").run();
    db.prepare("UPDATE grievances SET latitude = 12.9249, longitude = 80.1000 WHERE grievance_code = '2026-001245' AND latitude IS NULL").run();
    db.prepare("UPDATE grievances SET latitude = 13.0012, longitude = 80.2565 WHERE grievance_code = '2026-001198' AND latitude IS NULL").run();
    db.prepare("UPDATE grievances SET latitude = 12.9516, longitude = 80.1462 WHERE grievance_code = '2026-001167' AND latitude IS NULL").run();
  }
}

function seedDatabase() {
  const hash = bcrypt.hashSync('Password@123', 10);

  const insertSetting = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
  const defaultSettings: Record<string, string> = {
    grievance_prefix: '2026',
    otp_expiry_minutes: '5',
    otp_max_attempts: '5',
    allow_user_registration: 'true',
    push_notifications_enabled: 'true',
    auto_assign_by_department: 'true',
    grievance_sequence: '1245',
  };
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  const insertDept = db.prepare(
    'INSERT INTO departments (name_ta, name_en, head_designation, active) VALUES (?, ?, ?, 1)'
  );
  const depts = [
    ['சாலை துறை', 'Roads & Highways Dept', 'Chief Engineer'],
    ['குடிநீர் துறை', 'Water Supply & Drainage', 'Executive Engineer'],
    ['மின்சார துறை', 'Electricity Board', 'Superintending Engineer'],
    ['நகராட்சி துறை', 'Municipal Administration', 'Municipal Commissioner'],
    ['சுகாதார துறை', 'Sanitation & Public Health', 'Health Officer'],
    ['பொது பாதுகாப்பு', 'Public Safety & Civic', 'Zonal Officer'],
  ];
  for (const [ta, en, head] of depts) {
    insertDept.run(ta, en, head);
  }

  const insertCat = db.prepare(
    'INSERT INTO categories (name_ta, name_en, icon_key, color_key, sla_days, active) VALUES (?, ?, ?, ?, ?, 1)'
  );
  const cats = [
    ['சாலை & போக்குவரத்து', 'Road & Traffic', 'road', 'amber', 5],
    ['குடிநீர் & நீர்வழங்கல்', 'Water & Drainage', 'water', 'blue', 3],
    ['மின்சாரம்', 'Electricity', 'electric', 'yellow', 2],
    ['சுகாதாரம் & துப்புரவு', 'Sanitation & Hygiene', 'sanitation', 'teal', 3],
    ['குப்பை மேலாண்மை', 'Waste Management', 'waste', 'green', 2],
    ['அரசு சேவைகள்', 'Government Services', 'govt', 'rose', 7],
    ['பொது இட பாதுகாப்பு', 'Public Safety', 'safety', 'indigo', 3],
    ['மற்றவை', 'Others', 'other', 'purple', 7],
  ];
  for (const [ta, en, icon, color, sla] of cats) {
    insertCat.run(ta, en, icon, color, sla);
  }

  const insertUser = db.prepare(`
    INSERT INTO users (role, sub_role, full_name, username, email, phone, password_hash, district, area, designation, department_id, location, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run('admin', 'officer', 'நிர்வாகி (Admin)', 'admin', 'admin@grievance.gov.in', '+91 98765 00001', hash, 'Chennai', 'Secretariat', 'State Nodal Admin', null, 'Chennai HQ', 'active', '2026-06-01 09:00:00');
  insertUser.run('officer', 'officer', 'குமார் R', 'kumar.r', 'kumar@dept.gov.in', '+91 98765 43210', hash, 'Chennai', 'Tambaram', 'உதவி பொறியாளர் (Assistant Engineer)', 1, 'Tambaram Zone', 'active', '2026-06-10 09:00:00');
  insertUser.run('officer', 'officer', 'சுந்தரி M', 'sundari.m', 'sundari@dept.gov.in', '+91 98765 43211', hash, 'Chennai', 'Adyar', 'ஆய்வாளர் (Inspector)', 4, 'Adyar Zone', 'active', '2026-06-12 09:00:00');
  insertUser.run('officer', 'officer', 'ரமேஷ் P', 'ramesh.p', 'ramesh@dept.gov.in', '+91 98765 43212', hash, 'Chennai', 'Anna Nagar', 'மேற்பார்வையாளர் (Supervisor)', 2, 'Anna Nagar', 'inactive', '2026-06-15 09:00:00');
  insertUser.run('officer', 'field_worker', 'குமரேஷ் K', 'kumaresan.k', 'kumaresan@field.gov.in', '+91 98765 43220', hash, 'Chennai', 'Tambaram', 'களப்பணி ஊழியர் (Field Worker)', 1, 'Tambaram East', 'active', '2026-07-01 09:00:00');
  insertUser.run('officer', 'field_worker', 'சந்திரன் M', 'chandran.m', 'chandran@field.gov.in', '+91 98432 76510', hash, 'Chennai', 'Chromepet', 'பராமரிப்பு குழு (Maintenance Crew)', 2, 'Chromepet', 'active', '2026-07-05 09:00:00');
  insertUser.run('citizen', 'officer', 'கணேசன் S', 'user.demo', 'user@email.com', '+91 98765 43210', hash, 'Chennai', 'Tambaram', '', null, 'Chennai, Tamil Nadu', 'active', '2026-07-10 10:00:00');
  insertUser.run('citizen', 'officer', 'பிரியா K', 'priya.k', 'priya@email.com', '+91 98401 11223', hash, 'Madurai', 'Anna Nagar', '', null, 'Madurai, Tamil Nadu', 'active', '2026-08-14 11:30:00');
  insertUser.run('citizen', 'officer', 'செந்தில் R', 'senthil.blocked', 'senthil@email.com', '+91 98409 99887', hash, 'Coimbatore', 'Gandhipuram', '', null, 'Coimbatore', 'blocked', '2026-09-01 14:00:00');

  insertUser.run('officer', 'officer', 'முரளி K', 'murali.k', 'murali@dept.gov.in', '+91 97890 11223', hash, 'Chennai', 'Velachery', 'உதவி பொறியாளர் (Assistant Engineer)', 1, 'Velachery', 'pending', '2026-11-12 09:00:00');
  insertUser.run('officer', 'officer', 'காயத்திரி S', 'gayathri.s', 'gayathri@dept.gov.in', '+91 97890 11224', hash, 'Chennai', 'Guindy', 'ஆய்வாளர் (Inspector)', 4, 'Guindy', 'pending', '2026-11-11 09:00:00');
  insertUser.run('officer', 'officer', 'அருண் V', 'arun.v', 'arun@dept.gov.in', '+91 97890 11225', hash, 'Chennai', 'T. Nagar', 'மேற்பார்வையாளர் (Supervisor)', 3, 'T. Nagar', 'pending', '2026-11-10 09:00:00');
  insertUser.run('citizen', 'officer', 'கார்த்திக் M', 'karthik.m', 'karthik@email.com', '+91 98412 55667', hash, 'Trichy', 'Thillai Nagar', '', null, 'Trichy', 'pending', '2026-11-13 15:00:00');

  const insertGrievance = db.prepare(`
    INSERT INTO grievances (
      grievance_code, citizen_id, category_id, department_id, title, description,
      location, latitude, longitude, upvote_count, escalated, status, priority,
      assigned_officer_id, assigned_worker_id, due_date,
      photo_urls, field_photo_urls, field_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTimeline = db.prepare(`
    INSERT INTO grievance_timeline (grievance_id, step_key, title_ta, title_en, remarks, actor_id, actor_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const g1 = insertGrievance.run(
    '2026-001245', 7, 1, 1,
    'சாலை பழுதடைந்துள்ளது / Road Pothole Near Tambaram',
    'சாலை விரிசல் மற்றும் பள்ளம் காரணமாக போக்குவரத்து நெரிசல் ஏற்பட்டுள்ளது. உடனடியாக சீரமைக்கவும்.',
    'சென்னை, தாம்பரம் (Chennai, Tambaram)', 12.9249, 80.1000, 3, 0,
    'in_progress', 'high', 2, 5, '2026-11-20',
    JSON.stringify(['/src/assets/images/road_pothole_sample_1794847798417.jpg']),
    JSON.stringify(['/src/assets/images/road_repair_crew_1794847798853.jpg']),
    'பழுது பார்க்கும் பணி தொடங்கப்பட்டு தற்காலிக தடுப்புகள் அமைக்கப்பட்டுள்ளன.',
    '2026-11-14 10:24:00', '2026-11-16 14:15:00'
  ).lastInsertRowid as number;

  insertTimeline.run(g1, 'submitted', 'புகார் பதிவு செய்யப்பட்டது', 'Grievance Submitted', 'Citizen filed report with GPS & photo evidence.', 7, 'கணேசன் S', '2026-11-14 10:24:00');
  insertTimeline.run(g1, 'assigned', 'அதிகாரிக்கு ஒதுக்கப்பட்டது', 'Assigned to Officer', 'Assigned to Kumar R (Assistant Engineer).', 1, 'நிர்வாகி (Admin)', '2026-11-15 11:30:00');
  insertTimeline.run(g1, 'in_progress', 'நடவடிக்கை நடைபெறுகிறது', 'Action In Progress', 'Field crew dispatched for asphalt repair.', 2, 'குமார் R', '2026-11-16 14:15:00');

  db.prepare(
    `INSERT INTO grievance_comments (grievance_id, author_id, author_name, author_role, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(g1, 2, 'குமார் R', 'officer', 'களப்பணி குழுவினர் இன்று மாலை சாலையை சீரமைப்பார்கள்.', '2026-11-16 14:30:00');

  const g2 = insertGrievance.run(
    '2026-001198', 7, 2, 2,
    'கழிவுநீர் & குடிநீர் பிரச்சினை / Drainage Overflow',
    'பிரதான தெருவில் கழிவுநீர் அடைப்பு மற்றும் குடிநீர் குழாய் கசிவு சரி செய்யப்பட வேண்டும்.',
    'சென்னை, அடையாறு (Chennai, Adyar)', 13.0012, 80.2565, 2, 0,
    'resolved', 'medium', 3, 6, '2026-11-15',
    JSON.stringify(['/src/assets/images/road_pothole_sample_1794847798417.jpg']),
    JSON.stringify(['/src/assets/images/road_repair_crew_1794847798853.jpg']),
    'அடைப்பு முழுமையாக நீக்கப்பட்டு குழாய் சீரமைக்கப்பட்டது.',
    '2026-11-10 11:30:00', '2026-11-12 16:20:00'
  ).lastInsertRowid as number;
  insertTimeline.run(g2, 'submitted', 'புகார் பதிவு செய்யப்பட்டது', 'Grievance Submitted', 'Water & drainage complaint logged.', 7, 'கணேசன் S', '2026-11-10 11:30:00');
  insertTimeline.run(g2, 'assigned', 'அதிகாரிக்கு ஒதுக்கப்பட்டது', 'Assigned to Officer', 'Assigned to Sundari M.', 1, 'நிர்வாகி (Admin)', '2026-11-10 14:00:00');
  insertTimeline.run(g2, 'in_progress', 'நடவடிக்கை நடைபெறுகிறது', 'Action In Progress', 'Maintenance crew inspecting pipeline.', 3, 'சுந்தரி M', '2026-11-11 10:00:00');
  insertTimeline.run(g2, 'resolved', 'தீர்வு செய்யப்பட்டது', 'Resolved', 'Pipeline sealed and drainage cleared.', 3, 'சுந்தரி M', '2026-11-12 16:20:00');

  const g3 = insertGrievance.run(
    '2026-001167', 7, 3, 3,
    'மின்சாரம் இல்லை - தெரு விளக்கு / Streetlight Outage',
    'வார்டு 14 சந்திப்பில் கடந்த 2 நாட்களாக தெரு விளக்குகள் எரியவில்லை.',
    'சென்னை, குரோம்பேட்டை (Chennai, Chromepet)', 12.9516, 80.1462, 1, 0,
    'assigned', 'low', 2, 5, '2026-11-22',
    JSON.stringify([]),
    JSON.stringify([]),
    '',
    '2026-11-08 15:15:00', '2026-11-09 09:30:00'
  ).lastInsertRowid as number;
  insertTimeline.run(g3, 'submitted', 'புகார் பதிவு செய்யப்பட்டது', 'Grievance Submitted', 'Streetlight outage reported.', 7, 'கணேசன் S', '2026-11-08 15:15:00');
  insertTimeline.run(g3, 'assigned', 'அதிகாரிக்கு ஒதுக்கப்பட்டது', 'Assigned to Officer', 'Assigned to Kumar R for feeder inspection.', 1, 'நிர்வாகி (Admin)', '2026-11-09 09:30:00');

  const extraGrievances: Array<[string, number, number, number, string, string, string, string, string, number | null, string, string]> = [
    ['2026-001152', 8, 5, 5, 'குப்பை அகற்றுதல் தாமதம் / Waste Collection Delay', 'தினசரி குப்பை வண்டி வராததால் குப்பைகள் தேங்கியுள்ளன.', 'மதுரை, அண்ணா நகர்', 'new', 'high', null, '2026-11-15 08:40:00', '2026-11-14'],
    ['2026-001140', 8, 4, 5, 'பொது கழிப்பிடம் சுத்தம் / Sanitation Maintenance', 'பேருந்து நிலையம் அருகே சுகாதார பணிகள் தேவை.', 'மதுரை, பெரியார்', 'overdue', 'high', 2, '2026-10-20 12:10:00', '2026-10-23'],
    ['2026-001129', 7, 6, 4, 'பிறப்பு சான்றிதழ் திருத்தம் / Certificate Correction', 'நகராட்சி பதிவில் முகவரி திருத்தம் நிலுவையில் உள்ளது.', 'சென்னை, தாம்பரம்', 'resolved', 'low', 3, '2026-10-05 10:00:00', '2026-10-12'],
    ['2026-001095', 8, 1, 1, 'சிக்னல் விளக்கு பழுது / Traffic Signal Fault', 'பிரதான சாலையில் சிக்னல் விளக்கு செயல்படவில்லை.', 'மதுரை, கோரிப்பாளையம்', 'resolved', 'high', 2, '2026-09-18 09:20:00', '2026-09-23'],
    ['2026-001060', 7, 2, 2, 'குடிநீர் குழாய் உடைப்பு / Water Pipe Burst', 'மெயின் ரோட்டில் குடிநீர் குழாய் உடைந்துள்ளது.', 'சென்னை, பல்லாவரம்', 'resolved', 'high', 3, '2026-08-12 07:45:00', '2026-08-15'],
    ['2026-001032', 8, 7, 6, 'பூங்கா விளக்கு அமைத்தல் / Park Safety Lighting', 'சிறுவர் பூங்காவில் கூடுதல் மின் விளக்கு தேவை.', 'மதுரை, கே.கே. நகர்', 'resolved', 'medium', 2, '2026-07-19 17:30:00', '2026-07-22'],
    ['2026-001011', 7, 3, 3, 'மின்கம்பி பராமரிப்பு / Overhead Line Maintenance', 'தாழ்வான மின்கம்பியை உயர்த்தி அமைக்க வேண்டும்.', 'சென்னை, தாம்பரம்', 'resolved', 'medium', 2, '2026-06-22 11:00:00', '2026-06-24'],
  ];

  for (const [code, cid, catId, deptId, title, desc, loc, status, prio, offId, created, due] of extraGrievances) {
    const gid = insertGrievance.run(
      code, cid, catId, deptId, title, desc, loc, null, null, 1, status === 'overdue' ? 1 : 0, status, prio, offId, null, due,
      JSON.stringify([]), JSON.stringify([]), '', created, created
    ).lastInsertRowid as number;
    insertTimeline.run(gid, 'submitted', 'புகார் பதிவு செய்யப்பட்டது', 'Grievance Submitted', 'Complaint registered.', cid, 'Citizen', created);
    if (status === 'resolved') {
      insertTimeline.run(gid, 'resolved', 'தீர்வு செய்யப்பட்டது', 'Resolved', 'Completed & closed by department.', offId ?? 2, 'Officer', created);
    }
  }

  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, role_target, grievance_id, type, title_ta, title_en, message_ta, message_en, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  insertNotif.run(7, 'citizen', g1, 'info', 'புகார் 2026-001245 ஆய்வில் உள்ளது', 'Grievance 2026-001245 Under Review', 'உங்கள் புகார் 2026-001245 உதவி பொறியாளரால் கள ஆய்வில் உள்ளது.', 'Your grievance 2026-001245 is currently under field inspection.', '2026-11-15 11:30:00');
  insertNotif.run(7, 'citizen', g2, 'success', 'புகார் 2026-001198 தீர்வு செய்யப்பட்டது', 'Grievance 2026-001198 Resolved', 'உங்கள் குடிநீர் மற்றும் கழிவுநீர் புகார் வெற்றிகரமாக தீர்க்கப்பட்டது.', 'Your water & drainage grievance has been resolved.', '2026-11-12 16:20:00');
  insertNotif.run(null, 'all', null, 'info', 'புதிய அரசு அறிவிப்பு – நகர் துப்புரவு முகாம்', 'Civic Announcement – City Sanitation Drive', 'நவம்பர் 20 அன்று அனைத்து வார்டுகளிலும் சிறப்பு தூய்மை முகாம் நடைபெறும்.', 'Special sanitation drive across all wards on Nov 20.', '2026-11-07 09:00:00');
  insertNotif.run(2, 'officer', g1, 'warning', 'புதிய புகார் ஒதுக்கீடு 2026-001245', 'New Assignment 2026-001245', 'உயர் முன்னுரிமை சாலை புகார் உங்களுக்கு ஒதுக்கப்பட்டுள்ளது.', 'High priority road grievance assigned to your queue.', '2026-11-15 11:30:00');

  const insertLog = db.prepare(`
    INSERT INTO activity_logs (actor_id, actor_name, actor_role, action_type, summary_ta, summary_en, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertLog.run(1, 'நிர்வாகி (Admin)', 'admin', 'OFFICER_CREATED', 'புதிய அதிகாரி உருவாக்கப்பட்டது: குமார் R', 'New officer created: Kumar R', '2026-11-14 11:20:00');
  insertLog.run(1, 'நிர்வாகி (Admin)', 'admin', 'GRIEVANCE_ASSIGNED', 'புகார் ஒதுக்கப்பட்டது: 2026-001245 → குமார் R', 'Grievance assigned: 2026-001245 → Kumar R', '2026-11-14 10:45:00');
  insertLog.run(1, 'நிர்வாகி (Admin)', 'admin', 'ROLE_UPDATED', 'பதவி மாற்றம்: சுந்தரி M (ஆய்வாளர்)', 'Designation updated: Sundari M (Inspector)', '2026-11-13 16:10:00');
  insertLog.run(1, 'நிர்வாகி (Admin)', 'admin', 'LOGIN', 'உள்நுழைவு (Admin): admin@grievance.gov.in', 'Admin login verified via Email OTP', '2026-11-14 09:00:00');
}
