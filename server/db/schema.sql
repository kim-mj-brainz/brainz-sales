-- ============================================================
-- brainz 영업관리시스템 — 데이터베이스 스키마
-- MySQL 8.0+ / utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS brainz_sales
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE brainz_sales;

-- 컬렉션 키-값 테이블
-- 각 컬렉션(users / incalls / references / credits / docs 등)을
-- JSON 배열로 통째로 저장합니다.
CREATE TABLE IF NOT EXISTS collections (
  col_key    VARCHAR(100) PRIMARY KEY COMMENT '컬렉션 이름 (users, incalls, references 등)',
  data       LONGTEXT     NOT NULL    COMMENT 'JSON 배열',
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
