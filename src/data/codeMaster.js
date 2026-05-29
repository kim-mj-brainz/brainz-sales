/* =============================================================
   통합 코드마스터 (담당: 공통영역, 관리: ADMIN)
   4개 요구사항 정의서에 흩어진 코드값을 하나로 통합.
   INFRA_TYPE: InCall은 EMS/SIEM/ITSM 3종.
   레퍼런스 모듈은 별도로 세부 모듈(MODULE_TREE)을 가진다.
   ADMIN 이 코드마스터 화면에서 추가/삭제 → store('master') 에 저장.
   ============================================================= */

export const DEFAULT_MASTER = {
  // ----- 인콜 CRM -----
  SALES_PERSON: ['김영업', '이영업', '박영업', '최영업', '정영업', '한영업', '오영업'],
  PRESALES: ['김프리', '이프리', '박프리'],
  INFRA_TYPE: ['EMS', 'SIEM', 'ITSM'], // 이 세 가지만 (InCall 정의서 강제)
  PIPELINE_STATUS: ['컨택중', '견적서전달', '고객미팅', '계약완료', '영업실패'],
  INFLOW_TYPE: ['홈페이지', '조달', '기존고객', '파트너', '전시회', '영업발굴', '기타'],

  // ----- 레퍼런스 -----
  INDUSTRY: ['대규모', '금융', '공공', '제조', '통신', '교육', '의료', '유통', '서비스', '게임', '클라우드/MSP'],
  ORG_TYPE: [
    '공공기관', '중앙정부', '지방자치단체', '공기업', '준정부기관', '공공의료기관', '공공교육기관',
    '국방/군', '경찰/소방', '연구기관', '협회/재단', '대학', '학교', '병원',
    '민간기업', '대기업', '중견기업', '중소기업', '스타트업', '외국계기업', '금융기관',
    '비영리기관(NGO/NPO)', '언론사', '통신사', '제조사', '유통사', 'MSP', 'CSP', 'SI기업', 'SaaS기업',
  ],
};

/* 레퍼런스 도입 모듈 트리 (EMS 하위 포인트솔루션) */
export const MODULE_TREE = {
  EMS: ['RTMS', 'ERMS', 'OAM', 'GPM', 'CMS', 'K8s', 'NPM', 'SMS', 'VMS', 'DBMS', 'STMS', 'BMS', 'WNMS', 'Syslog/Trap', 'TMS', 'NMS', 'BRMS', 'APM', 'IMS', 'FMS'],
  ITSM: [],
  SIEM: [],
  Dashboard: [],
};

/* 신용등급 옵션 (문서생성 정의서) */
export const CREDIT_GRADES = [
  'AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-',
  'B+', 'B', 'B-', 'CCC', 'CC', 'C', 'D',
];

/* ----- 공통 검증 정규식 ----- */
// InCall 매출코드: A12345-01
export const SALES_CODE_INCALL = /^[A-Da-d]\d{5}-\d{2}$/;
// 문서생성 매출코드: A12345 (알파벳1 + 숫자5)
export const SALES_CODE_DOC = /^[A-Za-z]\d{5}$/;
