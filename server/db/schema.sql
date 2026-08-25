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

CREATE TABLE IF NOT EXISTS document_credit_requests (
  id VARCHAR(80) PRIMARY KEY,
  company VARCHAR(255) NOT NULL,
  requester_name VARCHAR(100),
  requester_email VARCHAR(255),
  input_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  completed_at DATETIME,
  result_json JSON,
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 조달(G2B) 공공데이터포털 SERVICE_KEY. 단일 행만 사용(id='default').
-- 조회 API는 원문을 절대 내려주지 않고 설정 여부만 반환한다.
CREATE TABLE IF NOT EXISTS g2b_settings (
  id VARCHAR(20) PRIMARY KEY,
  service_key VARCHAR(500),
  base_url VARCHAR(500),
  dtl_prdct_nos JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 조달(G2B) 나라장터 조달실적 원자료. 자연키는 (물품(납품요구)번호, 변경차수, 물품순번) —
-- PRD 검증 완료: 물품식별번호(prdct_idnt_no)는 자연키로 쓰면 안 됨(동일 식별번호가 한
-- 납품요구 안에서 서로 다른 줄로 중복 발주되는 경우가 있어 upsert 시 매출 누락됨).
CREATE TABLE IF NOT EXISTS g2b_procurement_records (
  dlvr_req_no VARCHAR(50) NOT NULL,
  dlvr_req_chg_cha VARCHAR(20) NOT NULL,
  prdct_sno VARCHAR(20) NOT NULL,
  dcisn_dt DATE,
  corp_nm VARCHAR(255),
  corp_biz_no VARCHAR(50),
  prdct_idnt_no VARCHAR(50),
  prdct_clsfc_nm VARCHAR(255),
  dtl_prdct_nm VARCHAR(255),
  dmnd_instt_nm VARCHAR(255),
  dlvr_req_nm VARCHAR(500),
  dlvr_amt DECIMAL(18,2),
  dlvr_qty DECIMAL(18,2),
  contract_no VARCHAR(100),
  raw_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dlvr_req_no, dlvr_req_chg_cha, prdct_sno),
  INDEX idx_g2b_corp_nm (corp_nm)
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
