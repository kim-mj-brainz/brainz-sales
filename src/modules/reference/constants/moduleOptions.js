/* 레퍼런스 모듈 전용 상수 — 도입 모듈 트리
   EMS를 선택한 경우 EMS_SUB_MODULES 중 1개 이상을 반드시 선택해야 한다. */

export const EMS_SUB_MODULES = [
  'RTMS', 'ERMS', 'OAM', 'GPM', 'CMS', 'K8s', 'NPM', 'SMS', 'VMS', 'DBMS',
  'STMS', 'BMS', 'WNMS', 'Syslog/Trap', 'TMS', 'NMS', 'BRMS', 'APM', 'IMS', 'FMS',
];

export const OTHER_MODULES = ['ITSM', 'SIEM', 'Dashboard'];

/* 드롭다운 그룹 정의 */
export const MODULE_GROUPS = [
  { label: 'EMS 계열', parentKey: 'EMS', children: EMS_SUB_MODULES },
  { label: '기타',     parentKey: null,   children: OTHER_MODULES },
];

/* 전체 모듈 플랫 목록 (데이터 저장/검색용) */
export const ALL_MODULE_NAMES = ['EMS', ...EMS_SUB_MODULES, ...OTHER_MODULES];
