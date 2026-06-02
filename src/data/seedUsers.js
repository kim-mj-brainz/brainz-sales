/* =============================================================
   초기 사용자 더미 데이터 (담당: 공통영역)
   사번(employeeNo)을 ID 로 사용 (FR-AUTH-01).
   비밀번호는 MVP 에서 평문 비교용 더미.
   TODO: 실제 연동 시 bcrypt/argon2 해시 + 서버 인증 (FR-LOGIN-02)
   ============================================================= */
import { ROLES } from '../common/permissions.js';

export const SEED_USERS = [
  { id: 'E001', employeeNo: 'E001', name: '김관리', team: '영업기획팀', email: 'admin@brainz.co.kr', phone: '010-1000-0001', role: ROLES.ADMIN, active: true, password: '1234' },
  { id: 'E002', employeeNo: 'E002', name: '이부장', team: '영업1팀', email: 'manager@brainz.co.kr', phone: '010-1000-0002', role: ROLES.MANAGER, active: true, password: '1234' },
  { id: 'E003', employeeNo: 'E003', name: '박영업', team: '영업1팀', email: 'user1@brainz.co.kr', phone: '010-1000-0003', role: ROLES.USER, active: true, password: '1234' },
  { id: 'E004', employeeNo: 'E004', name: '최영업', team: '영업2팀', email: 'user2@brainz.co.kr', phone: '010-1000-0004', role: ROLES.USER, active: true, password: '1234' },
];
