# 검수확인서 메일 자동발송 PRD

## 배경
문서 메뉴에서 검수확인서 XLSX를 생성한 뒤 담당엔지니어에게 자동으로 메일을 보내야 한다. 현재 프론트엔드만 있는 Vite 앱에서는 SMTP 계정 및 첨부파일 발송을 안전하게 처리할 수 없으므로 서버 API가 필요하다.

## 범위
- 문서 메뉴의 검수확인서 생성 기능에서 호출할 메일 발송 API를 제공한다.
- 수신자는 담당엔지니어 이메일을 기본으로 한다.
- 선택적으로 담당영업을 CC에 포함한다.
- 생성된 검수확인서 XLSX를 첨부파일로 발송한다.

## API 요구사항
- Endpoint 예시: `POST /api/document-mails/inspection`
- Content-Type: `application/json`
- 요청 본문:
  - `type`: `"inspection-confirmation"`
  - `fromName`: 발신자 표시명
  - `to`: `{ name, email }[]`
  - `cc`: `{ name, email }[]`
  - `subject`: 메일 제목
  - `body`: 메일 본문
  - `attachments`: `{ filename, contentType, contentBase64 }[]`
  - `meta`: `{ customer, project, documentNo, itemCount }`

## 처리 규칙
- 서버는 SMTP/메일 서비스 인증정보를 환경변수로 관리한다.
- 프론트엔드는 SMTP 비밀번호, API 키, OAuth 토큰을 저장하지 않는다.
- API는 수신자 이메일 형식을 검증하고, 첨부파일 확장자와 MIME 타입을 제한한다.
- 성공 시 HTTP 2xx를 반환한다.
- 실패 시 HTTP 4xx/5xx와 오류 메시지를 반환한다.

## 감사/이력
- 발송 성공/실패 이력을 문서 생성 이력 또는 별도 메일 발송 로그에 저장한다.
- 최소 기록 항목: 생성일시, 고객사, 건명, 담당엔지니어, 수신 이메일, 발송 상태, 오류 메시지.

## 프론트엔드 연동 상태
- 문서 메뉴에는 메일 API URL, 발신자명, 제목, 본문, 담당영업 CC 설정이 추가되어 있다.
- API URL이 설정되면 검수확인서 생성 후 위 스펙으로 POST한다.
- API URL이 비어 있으면 브라우저 기본 메일 앱 초안을 연다. 이 경우 브라우저 제약상 첨부파일 자동 첨부는 보장하지 않는다.
