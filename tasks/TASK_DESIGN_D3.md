# [브리프] D-3: v2 마크업 재배치 — 시안 1:1 근접

> 대상 모델: 오퍼스 권장 · 발행: 페이블 QA(2026-07-05)
> 배경: D-2는 style.css만 교체(리스킨)라 시안의 **레이아웃 구조**가 반영 안 됨. 페이블이 CSS 핫픽스로 "로드맵=좌측 주인공, 사이드바=우측 340px" 스왑까지는 적용함(main-grid 1fr 340px + sidebar order:2). 나머지 구조 격차를 마크업 수준에서 해소하는 것이 이 태스크.

## 작업 폴더
`khu-weaver_v2/` 만. (khu-weaver_v1 정본·03_디자인 시안은 읽기 전용)

## 절대 규칙
1. **JS 파일 수정 금지** (app.js/onboarding.js/registry/data 전부).
2. index.html 요소는 **이동·재배치만 허용, id/class 삭제·개명 금지** (JS가 getElementById/querySelector로 잡는 참조 보존). 순수 장식용 래퍼 div 추가는 허용.
3. 새 기능 발명 금지 — 시안의 "다음 학기 추천 빌드" 카드는 JS 없이는 동작 안 하므로 **넣지 말 것** (추후 별도 태스크).

## 대조 기준
`03_디자인 시안/dashboard_roadmap_v1.html`을 브라우저 렌더 기준으로 삼아, v2 index.html/style.css를 다음 순서로 맞춘다:
1. **상단바**: 로고+학과·학번 칩+기준학기 칩 한 줄 56px — 기존 헤더(.logo-section 등)를 이 구성으로 재배치
2. **사이드바(우측)**: 위에서부터 ①졸업 이수율(큰 숫자+진행바+이수구분별 캡션) ②전공평점·주력트랙 KPI 2칸 ③역량 레이더 — 기존 카드 순서를 이 순서로 이동
3. **메인(좌측)**: 페이지 제목("나의 전공 로드맵")+상태 범례 3종 → 학년 레인 그리드(timeline-years-grid). 레인 헤더는 시안의 .lane-h 스타일
4. **노드**: 시안의 상태 3종(버건디채움+✓ / 파랑테두리+'수강 가능' / 회색점선+🔒)과 트랙 4px 스트라이프가 실제 타임라인 카드에 적용됐는지 CSS 셀렉터-실DOM 매칭 확인(D-2가 CSS는 넣었으나 기존 클래스와 셀렉터 불일치 가능)

## 검증 (필수, 순서대로)
1. `diff` 로 v2 JS·데이터가 khu-weaver_v1과 여전히 동일한지 확인 (`diff -rq` 결과가 css/style.css, index.html 2건만이어야 함)
2. index.html의 모든 id가 작업 전과 동일 집합인지: 작업 전 `grep -o 'id="[^"]*"' index.html | sort > /tmp/before.txt` 떠놓고 작업 후 diff
3. 전 JS node --check + 로드 시뮬레이션(CURRICULA 7학번)
4. STATUS.md 1줄 보고 후 **사용자 육안확인 요청**으로 종료
