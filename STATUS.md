# KHU-Weaver v2 — 작업 STATUS

## F-3. 탭 개편 + 기이수 입력 접근성 (완료 · 2026-07-08)

한 줄 보고: F-3 완료 — 트랙 탭줄에 "진로 트렌드"·"내 분석" 뷰 탭 신설, 사이드바 제거 후 로드맵 전폭 전환, 기이수 입력을 온보딩 3/3 재사용 모달로 이동(하단 중복 섹션 제거). TRENDS.js 존재 확인.

### 변경 파일
- `index.html` — 사이드바(`.sidebar-panel`) 제거, 분석 3카드(졸업이수율·전공평점·역량레이더)를 `#analysis-view`로 이동. 트랙 탭줄에 `data-view="trends|analysis"` 뷰 탭 2개 추가. 로드맵을 `#roadmap-view`로 감싸고 좌상단에 `#btn-open-history`(기이수 교과목 입력) 버튼 배치. 하단 하드코딩 트렌드 카드(`.trend-panel`) 제거 → `#trends-view`. 기존 기이수 체크 UI 컨테이너(`#curriculum-selector-container`)는 app.js 로직 보존용으로 `#legacy-curriculum-holder`(display:none)에 유지.
- `css/style.css` — `.main-grid` 1열 전환. `.track-selectors` flex 전환 + `.view-tab`(골드 구분) 스타일. `.roadmap-toolbar`/`.btn-history`, `.analysis-grid`, 진로 트렌드용 세로 막대그래프(`.trend-vchart`/`.tvbar*`)·분석(`.trend-analysis`)·출처(`.trend-sources`) 스타일 추가. (기존 규칙 삭제 없이 추가/수정만)
- `js/app.js` — `currentView` 상태 + `switchView()`(로드맵/트렌드/내분석 전환, 헤딩·범례 갱신) + `renderTrends()`(KW_TRENDS 단위별 그룹 세로 막대 + 각 막대 수치 + 출처(기관·연도·링크) + analysis 배열 그대로 렌더, 임의 창작 없음, 데이터 없으면 "출처 수집 중" 빈 상태). 트랙 버튼 클릭 핸들러를 뷰 라우팅으로 확장. `#btn-open-history` → `window.KW_ONBOARDING.openHistory()`.
- `js/onboarding.js` — `historyOnly` 모드 추가: 온보딩 3/3(A 스크린샷 / B 직접선택) UI를 모달로 재사용. C("아직 수강한 과목이 없어요") 카드는 이 진입경로에서 제외, 단계 인디케이터 숨김, 기존 이수 체크 상태(completedCourses)를 bSelected로 프리로드해 표시. 저장 시 기존 finish()→applyProfile 경로로 대시보드 즉시 갱신. 진입점 `window.KW_ONBOARDING.openHistory()` 노출.

### 3-4 검증 시나리오

탭 전환 3종 렌더:
- 전체(로드맵): 초기 화면 = `#roadmap-view` 표시, `#trends-view`/`#analysis-view` display:none. 헤딩 "나의 전공 로드맵" + 상태 범례 표시. 트랙 탭(all/반도체/…/회로)은 기존대로 로드맵 필터.
- 진로 트렌드 탭 클릭 → `#trends-view`만 표시, 헤딩 "산업계 수요 기술 트렌드"·범례 숨김. `renderTrends()`가 KW_TRENDS.items를 단위별(%,만 명)로 그룹핑해 세로 막대(각 막대에 수치)·분석 5줄(analysis 배열 그대로)·출처(기관·연도·링크) 렌더. 데이터 미존재 시 "출처 수집 중" 빈 상태.
- 내 분석 탭 클릭 → `#analysis-view`만 표시(졸업이수율·전공평점·역량레이더 3카드). `updateRadarChart()`+`renderMajorGpa()` 재호출로 수치·레이더 갱신. 헤더 성적계산기 진입점(`#btn-open-gpa-header`)은 유지.

모달 열기→체크 변경→반영:
- 로드맵 좌상단 "＋ 기이수 교과목 입력" 클릭 → `KW_ONBOARDING.openHistory()`가 프로필(저장됨)로 온보딩 3/3을 모달로 오픈. 기존 이수 과목이 B 패널에 체크된 상태로 표시(프리로드). C 카드 미노출.
- B 패널에서 과목 체크 변경 후 "…반영하고 시작" → `finish()`→`applyCompleted()`+`applyProfile()`로 completedCourses 갱신 → 로드맵 노드 상태/역량 레이더/졸업 이수율/전공 평점 즉시 재계산. 하단 중복 "기이수 교과목 입력" 섹션은 제거되어 중복 입력 경로 없음.

### 구문/무결성 검증
- `js/data/TRENDS.js`: `node --check` 통과.
- F-3 신규 코드 블록(switchView/renderTrends, onboarding historyOnly/openHistory): 격리 구문 프로브로 `node --check` 통과. app.js·onboarding.js 편집 경계(스플라이스 지점)는 중괄호/괄호 균형 직접 확인.
- getElementById 참조 무결성: 사이드바 이동 후 `radarChart`·`stat-*`·`btn-open-gpa`·`curriculum-selector-container` 등 JS 참조 ID는 문서 내 각 1회만 존재(중복 없음). 신규 ID(`view-title`/`view-sub`/`roadmap-legend`/`roadmap-view`/`trends-view`/`analysis-view`/`trends-body`/`btn-open-history`) 모두 존재.

주의: 이번 세션의 리눅스 샌드박스 마운트가 편집된 기존 파일(app.js/onboarding.js/ocr.js 등)을 in-place로 재동기화하지 못해(새 파일은 즉시 동기화됨) `node --check`를 편집 파일 자체에 직접 실행하지 못함. 위와 같이 격리 프로브 + 경계 직접 검토로 대체 검증함. 로컬에서 `node --check js/app.js js/onboarding.js` 재확인 권장.
