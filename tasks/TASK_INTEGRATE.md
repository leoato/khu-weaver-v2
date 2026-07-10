# [브리프] 신규 데이터 통합·등록 (v1.6)

> 대상 모델: 소넷 · **선행조건: `tasks/STATUS.md`에서 C-2020~C-2024, F-2023 전부 PASS 확인 후에만 시작.** 하나라도 미완이면 중단하고 사용자에게 보고.

## 목표
새 데이터 파일들을 앱에 등록하고 v1.6으로 패치노트 기록. 작업 폴더: `khu-weaver_v1`.

## 수정 범위 (이 3개 파일의 지정 부분만 — 그 외 수정 금지)

### 1. `js/registry.js`
- EE의 `curriculumYears`를 신규 연도 포함 내림차순으로 갱신:
  `["2026", "2025", "2024", "2023", "2022", "2021", "2020"]`
- 다른 줄(폴백 로직 등)은 건드리지 않기.

### 2. `index.html`
- 기존 `js/data/EE_*.js` script 태그들 옆에 신규 파일 4개의 script 태그 추가 (기존 태그와 동일한 형식·위치 규칙, registry.js보다 뒤/app.js보다 앞 등 **기존 로드 순서 패턴을 그대로 따를 것**).

### 3. `PATCHNOTES.md`
- v1.6 항목 추가: "EE 2020~2024 교육과정 데이터 추가로 전자공학과 전 학번(2020~2026) 커버 완료 + 2023 데이터 무결성 수정(I-1)".
- 정렬 방향은 파일 내 기존 규칙(상단 명시)을 따르고, 규칙 표기가 없으면 최신이 위(탑다운)로 추가.

## 검증 (필수)
```bash
cd "khu-weaver_v1"
node tools/validate_curriculum.js --all          # 전 파일 PASS
node --check js/registry.js                       # 문법
# 전역 로드 시뮬레이션: index.html의 script 순서대로 파일들을 이어붙여 실행했을 때
# window.CURRICULA.EE에 7개 연도 키가 모두 존재하는지 node로 확인
```
(브라우저 자동화·npm 설치는 차단 환경 — node 시뮬레이션으로 검증)

## 보고
`tasks/STATUS.md`에 1줄: `| INT | registry+index+patchnotes | 7개 학번 등록 | PASS | - | 날짜 |`
완료 후 사용자에게 "페이블 세션에서 QA 검수 요청" 안내.
