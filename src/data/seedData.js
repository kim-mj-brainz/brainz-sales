/* =============================================================
   초기 업무 더미 데이터 (모듈별)
   각 모듈 담당자는 자기 seed 만 수정하면 된다.
   ============================================================= */

// ----- 레퍼런스 (담당: 레퍼런스) -----
export const SEED_REFERENCES = [
  { id: 'R-001', customer: '국방통합데이터센터', project: '통합관제 EMS 구축', bizNo: '2024-DEF-0012', year: 2024, region: '대전광역시 유성구', address: '대전광역시 유성구 대덕대로', industry: '공공', orgType: '국방/군', sales: '김영업', engineer: '김프리', revenue: 850000000, orderer: '국방부', modules: ['EMS', 'NPM', 'APM'], products: [{ name: 'BRAINZ EMS', qty: 1, unit: 'set', version: 'v7.2' }], status: '검수완료', createdAt: '2024-03-12', updatedAt: '2024-03-12', createdBy: 'E002' },
  { id: 'R-002', customer: '한국전력공사', project: '전력 SIEM 보안관제', bizNo: '2023-KEPCO-0445', year: 2023, region: '전라남도 나주시', address: '전라남도 나주시 전력로', industry: '공공', orgType: '공기업', sales: '이영업', engineer: '이프리', revenue: 1200000000, orderer: '한국전력공사', modules: ['SIEM'], products: [{ name: 'BRAINZ SIEM', qty: 2, unit: 'set', version: 'v5.0' }], status: '검수완료', createdAt: '2023-08-20', updatedAt: '2023-09-01', createdBy: 'E002' },
  { id: 'R-003', customer: '신한은행', project: '차세대 ITSM 도입', bizNo: '2024-SH-1102', year: 2024, region: '서울특별시 중구', address: '서울특별시 중구 세종대로', industry: '금융', orgType: '금융기관', sales: '박영업', engineer: '박프리', revenue: 640000000, orderer: '신한은행', modules: ['ITSM'], products: [{ name: 'BRAINZ ITSM', qty: 1, unit: 'set', version: 'v4.1' }], status: '검수미완료', createdAt: '2024-06-01', updatedAt: '2024-06-01', createdBy: 'E003' },
  { id: 'R-004', customer: '서울대학교병원', project: '의료 인프라 통합모니터링', bizNo: '2022-SNUH-0078', year: 2022, region: '서울특별시 종로구', address: '서울특별시 종로구 대학로', industry: '의료', orgType: '병원', sales: '최영업', engineer: '김프리', revenue: 430000000, orderer: '서울대학교병원', modules: ['EMS', 'DBMS', 'VMS'], products: [{ name: 'BRAINZ EMS', qty: 1, unit: 'set', version: 'v6.8' }], status: '검수완료', createdAt: '2022-11-15', updatedAt: '2022-11-20', createdBy: 'E002' },
];

// ----- 인콜 CRM (담당: 인콜) -----
export const SEED_INCALLS = [
  { id: 'IC-001', inflowDate: '2026-05-20', inflowType: '홈페이지', endUser: '삼성에스디에스', company: '삼성에스디에스', contactPerson: '정과장', contactPhone: '010-2222-3333', infra: ['EMS'], infraDetail: '데이터센터 통합관제 검토', sales: '김영업', presales: '김프리', status: '컨택중', winrate: 30, salesCode: 'A12345-01', activity: '초기 문의 접수, 자료 요청', note: '', ownerId: 'E003', createdAt: '2026-05-20T09:00:00Z', updatedAt: '2026-05-20T09:00:00Z' },
  { id: 'IC-002', inflowDate: '2026-05-18', inflowType: '파트너', endUser: 'LG CNS', company: 'LG CNS', contactPerson: '한부장', contactPhone: '010-4444-5555', infra: ['SIEM'], infraDetail: '보안관제 SIEM 도입 검토', sales: '이영업', presales: '이프리', status: '견적서전달', winrate: 55, salesCode: 'B23456-02', activity: '견적서 발송 완료', note: '경쟁사 비교 중', ownerId: 'E002', createdAt: '2026-05-18T10:00:00Z', updatedAt: '2026-05-19T14:00:00Z' },
  { id: 'IC-003', inflowDate: '2026-05-15', inflowType: '기존고객', endUser: '현대오토에버', company: '현대오토에버', contactPerson: '오차장', contactPhone: '010-6666-7777', infra: ['ITSM', 'EMS'], infraDetail: 'ITSM 고도화 + EMS 연계', sales: '박영업', presales: '박프리', status: '고객미팅', winrate: 70, salesCode: 'C34567-01', activity: '2차 미팅 진행, PoC 협의', note: '', ownerId: 'E003', createdAt: '2026-05-15T11:00:00Z', updatedAt: '2026-05-22T09:00:00Z' },
  { id: 'IC-004', inflowDate: '2026-05-10', inflowType: '조달', endUser: '한국도로공사', company: '한국도로공사', contactPerson: '최주임', contactPhone: '010-8888-9999', infra: ['EMS'], infraDetail: '나라장터 공고 대응', sales: '최영업', presales: '김프리', status: '계약완료', winrate: 100, salesCode: 'A45678-03', activity: '계약 체결 완료', note: '5월 납품 예정', ownerId: 'E004', createdAt: '2026-05-10T09:00:00Z', updatedAt: '2026-05-25T16:00:00Z' },
  { id: 'IC-005', inflowDate: '2026-05-05', inflowType: '전시회', endUser: '쿠팡', company: '쿠팡풀필먼트', contactPerson: '김대리', contactPhone: '010-1212-3434', infra: ['SIEM'], infraDetail: '전시회 부스 문의', sales: '정영업', presales: '이프리', status: '영업실패', winrate: 0, salesCode: 'D56789-01', activity: '예산 부족으로 보류', note: '내년 재검토', ownerId: 'E004', createdAt: '2026-05-05T13:00:00Z', updatedAt: '2026-05-12T10:00:00Z' },
];

// ----- 신용등급 거래처 (담당: 문서생성) -----
export const SEED_CREDITS = [
  { id: 'CR-001', company: '삼성에스디에스', grade: 'AAA', ceo: '황성우', bizNo: '124-81-00998', address: '서울특별시 송파구 올림픽로 35', expireMonth: '2026-12' },
  { id: 'CR-002', company: 'LG CNS', grade: 'AA+', ceo: '현신균', bizNo: '104-81-00998', address: '서울특별시 강서구 마곡중앙로', expireMonth: '2026-09' },
  { id: 'CR-003', company: '현대오토에버', grade: 'AA', ceo: '김윤구', bizNo: '101-81-12345', address: '서울특별시 강남구 테헤란로', expireMonth: '2027-03' },
  { id: 'CR-004', company: '쿠팡풀필먼트', grade: 'A', ceo: '정종철', bizNo: '530-86-00188', address: '서울특별시 송파구 송파대로', expireMonth: '2026-07' },
];

// ----- 문서 생성 이력 (담당: 문서생성) -----
export const SEED_DOCS = [
  { id: 'DOC-001', createdAt: '2026-05-22T10:30:00Z', customer: '삼성에스디에스', project: '데이터센터 EMS', salesCode: 'A12345', seq: '001', status: 'SUCCESS', files: ['license', 'delivery'], ownerId: 'E003' },
  { id: 'DOC-002', createdAt: '2026-05-21T15:10:00Z', customer: 'LG CNS', project: 'SIEM 보안관제', salesCode: 'B23456', seq: '002', status: 'FAIL', failReason: '견적서 PDF 형식 오류', errorId: 'ERR-20260521-A1', ownerId: 'E002' },
  { id: 'DOC-003', createdAt: '2026-05-20T09:45:00Z', customer: '현대오토에버', project: 'ITSM 고도화', salesCode: 'C34567', seq: '001', status: 'SUCCESS', files: ['license', 'delivery'], ownerId: 'E003' },
];

// ----- 직원 (담당영업/엔지니어 검색용, 문서생성 SearchPopup) -----
export const SEED_STAFF = [
  { id: 'E003', name: '박영업', dept: '영업1팀', role: '영업' },
  { id: 'E004', name: '최영업', dept: '영업2팀', role: '영업' },
  { id: 'E010', name: '김프리', dept: '기술팀', role: '엔지니어' },
  { id: 'E011', name: '이프리', dept: '기술팀', role: '엔지니어' },
  { id: 'E012', name: '박프리', dept: '기술팀', role: '엔지니어' },
];
