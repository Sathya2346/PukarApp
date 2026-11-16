-- Makkal Pugar Seyali MySQL 8.0 Schema (UTF8MB4 for Tamil + English)
CREATE DATABASE IF NOT EXISTS makkal_pugar
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE makkal_pugar;

CREATE TABLE IF NOT EXISTS departments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name_ta VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  head_designation VARCHAR(150) DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name_ta VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  icon_key VARCHAR(40) NOT NULL DEFAULT 'other',
  color_key VARCHAR(40) NOT NULL DEFAULT 'slate',
  sla_days INT NOT NULL DEFAULT 7,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('citizen', 'officer', 'admin') NOT NULL DEFAULT 'citizen',
  sub_role ENUM('officer', 'field_worker') NOT NULL DEFAULT 'officer',
  full_name VARCHAR(150) NOT NULL,
  username VARCHAR(120) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(24) DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  district VARCHAR(100) DEFAULT '',
  area VARCHAR(120) DEFAULT '',
  designation VARCHAR(150) DEFAULT '',
  department_id BIGINT NULL,
  location VARCHAR(180) DEFAULT '',
  status ENUM('active', 'pending', 'blocked', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_users_role_status (role, status),
  INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_otp_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  role ENUM('citizen', 'officer', 'admin') NOT NULL,
  purpose ENUM('login', 'register', 'reset_password') NOT NULL DEFAULT 'login',
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_lookup (email, role, consumed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grievances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  grievance_code VARCHAR(32) NOT NULL UNIQUE,
  citizen_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  department_id BIGINT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(200) NOT NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  upvote_count INT NOT NULL DEFAULT 1,
  escalated TINYINT(1) NOT NULL DEFAULT 0,
  reopen_count INT NOT NULL DEFAULT 0,
  citizen_rating TINYINT NULL,
  citizen_feedback VARCHAR(300) DEFAULT '',
  status ENUM('new', 'assigned', 'in_progress', 'resolved', 'overdue') NOT NULL DEFAULT 'new',
  priority ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
  assigned_officer_id BIGINT NULL,
  assigned_worker_id BIGINT NULL,
  due_date DATE NULL,
  photo_urls JSON NOT NULL,
  field_photo_urls JSON NOT NULL,
  field_notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_grievance_citizen FOREIGN KEY (citizen_id) REFERENCES portal_users(id),
  CONSTRAINT fk_grievance_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_grievance_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_grievance_status (status),
  INDEX idx_grievance_code (grievance_code),
  INDEX idx_grievance_geo (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grievance_timeline (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  grievance_id BIGINT NOT NULL,
  step_key VARCHAR(40) NOT NULL,
  title_ta VARCHAR(150) NOT NULL,
  title_en VARCHAR(150) NOT NULL,
  remarks TEXT,
  actor_id BIGINT NULL,
  actor_name VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_timeline_grievance FOREIGN KEY (grievance_id) REFERENCES grievances(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grievance_comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  grievance_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  author_name VARCHAR(150) NOT NULL,
  author_role VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comment_grievance FOREIGN KEY (grievance_id) REFERENCES grievances(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grievance_upvotes (
  grievance_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (grievance_id, user_id),
  CONSTRAINT fk_upvote_grievance FOREIGN KEY (grievance_id) REFERENCES grievances(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
