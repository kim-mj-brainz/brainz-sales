CREATE DATABASE IF NOT EXISTS brainz_sales
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE brainz_sales;

-- Legacy fallback table. Keep it until all old JSON data has been migrated.
CREATE TABLE IF NOT EXISTS collections (
  col_key    VARCHAR(100) PRIMARY KEY,
  data       LONGTEXT     NOT NULL,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  employee_no VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  team VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  active TINYINT(1) NOT NULL DEFAULT 1,
  password VARCHAR(255),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incalls (
  id VARCHAR(50) PRIMARY KEY,
  customer VARCHAR(255),
  project VARCHAR(255),
  sales_person VARCHAR(100),
  sales_email VARCHAR(255),
  sales_code VARCHAR(50),
  status VARCHAR(50),
  memo TEXT,
  owner_id VARCHAR(50),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `references` (
  id VARCHAR(50) PRIMARY KEY,
  customer VARCHAR(255),
  project VARCHAR(255),
  product VARCHAR(255),
  sales_code VARCHAR(50),
  inspection_status VARCHAR(50),
  inspection_completed_at DATETIME,
  owner_id VARCHAR(50),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(50) PRIMARY KEY,
  document_no VARCHAR(100),
  quote_no VARCHAR(100),
  customer VARCHAR(255),
  address TEXT,
  project VARCHAR(255),
  issue_date DATE,
  sales_code VARCHAR(50),
  seq VARCHAR(10),
  status VARCHAR(50),
  fail_reason TEXT,
  error_id VARCHAR(100),
  owner_id VARCHAR(50),
  sales_name VARCHAR(100),
  sales_phone VARCHAR(50),
  sales_email VARCHAR(255),
  engineer_name VARCHAR(100),
  engineer_phone VARCHAR(50),
  engineer_email VARCHAR(255),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id VARCHAR(50) NOT NULL,
  item_no INT,
  description TEXT,
  qty DECIMAL(12,2),
  unit VARCHAR(50),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_document_items_document_id (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_staff (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  role VARCHAR(50),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_customers (
  id VARCHAR(50) PRIMARY KEY,
  company VARCHAR(255) NOT NULL,
  address TEXT,
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_mail_settings (
  id VARCHAR(50) PRIMARY KEY,
  enabled TINYINT(1) DEFAULT 1,
  sender_name VARCHAR(100),
  cc_sales TINYINT(1) DEFAULT 1,
  smtp_enabled TINYINT(1) DEFAULT 0,
  smtp_host VARCHAR(255),
  smtp_port VARCHAR(10),
  smtp_secure TINYINT(1) DEFAULT 0,
  smtp_user VARCHAR(255),
  smtp_password VARCHAR(255),
  smtp_from_email VARCHAR(255),
  smtp_test_email VARCHAR(255),
  credit_google_chat_webhook_url TEXT,
  credit_google_chat_request_template TEXT,
  credit_google_chat_test_message TEXT,
  subject TEXT,
  body TEXT,
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credits (
  id VARCHAR(50) PRIMARY KEY,
  company VARCHAR(255) NOT NULL,
  grade VARCHAR(50),
  expire_month VARCHAR(20),
  address TEXT,
  ceo_name VARCHAR(100),
  requested_by VARCHAR(100),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  event_time DATETIME,
  actor_employee_no VARCHAR(50),
  actor_name VARCHAR(100),
  actor_role VARCHAR(50),
  category VARCHAR(100),
  event_type VARCHAR(100),
  target_type VARCHAR(100),
  target_id VARCHAR(100),
  target_name VARCHAR(255),
  result VARCHAR(50),
  fail_reason TEXT,
  extra JSON,
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
