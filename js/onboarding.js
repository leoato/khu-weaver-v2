/* =============================================================================
 * onboarding.js — 저마찰 3단계 온보딩 (UX_FLOW.md 기준)
 *   [0 랜딩] → [1/3 학과] → [2/3 학번·이름] → [3/3 이수이력 A/B/C] → 대시보드
 *   + 첫 완료 시 코치마크 3개 1회 노출
 *
 * 설계 계약(변경 금지):
 *   - 프로필 저장: localStorage['khu-weaver-profile'] = {dept, year, name}
 *   - 이수내역 저장: localStorage['khu-weaver-completed'] = [과목코드...] (app.js가 읽음)
 *   - DEPARTMENTS/ADMISSION_YEARS/getCurriculum 은 registry.js에서 읽는다(하드코딩 금지)
 *   - app.js의 전역(courses/prerequisites/tracks/completedCourses)과 렌더 함수를 재사용만 한다
 * 추가 저장키(부가, 계약 무관): 'khu-weaver-onboarding-draft', 'khu-weaver-coach-done'
 * (U-1 온보딩 개편)
 * ============================================================================= */
(function () {
    "use strict";

    var STORAGE_KEY = "khu-weaver-profile";
    var COMPLETED_KEY = "khu-weaver-completed";
    var DRAFT_KEY = "khu-weaver-onboarding-draft";
    var COACH_KEY = "khu-weaver-coach-done";
    var CURRENT_YEAR = 2026; // 현재 학년 추정 기준 연도

    // ---- DOM 참조 ----------------------------------------------------------
    var overlay = document.getElementById("onboarding-overlay");
    var obCard = document.getElementById("ob-card");
    var landing = document.getElementById("ob-landing");
    var wizard = document.getElementById("ob-wizard");
    var wizardFoot = document.getElementById("ob-wizard-foot");
    var startBtn = document.getElementById("ob-start");

    var titleEl = document.getElementById("ob-title");
    var subEl = document.getElementById("ob-sub");
    var stepBars = [
        document.getElementById("ob-step-1"),
        document.getElementById("ob-step-2"),
        document.getElementById("ob-step-3")
    ];
    var stepCount = document.getElementById("ob-step-count");
    var screens = [
        document.getElementById("ob-screen-1"),
        document.getElementById("ob-screen-2"),
        document.getElementById("ob-screen-3")
    ];

    var deptList = document.getElementById("ob-dept-list");
    var deptHint = document.getElementById("ob-dept-hint");
    var yearGrid = document.getElementById("ob-year-grid");
    var nameInput = document.getElementById("ob-name");
    var previewAv = document.getElementById("ob-preview-av");
    var previewTitle = document.getElementById("ob-preview-title");

    var next1Btn = document.getElementById("ob-next-1");
    var next2Btn = document.getElementById("ob-next-2");
    var back1Btn = document.getElementById("ob-back-1");
    var back2Btn = document.getElementById("ob-back-2");
    var back3Btn = document.getElementById("ob-back-3");

    // STEP 3 방법 선택 / 하위 패널
    var histChoose = document.getElementById("ob-hist-choose");
    var histA = document.getElementById("ob-hist-a");
    var histB = document.getElementById("ob-hist-b");
    var histC = document.getElementById("ob-hist-c");
    var shotPanel = document.getElementById("ob-shot-panel");
    var shotBack = document.getElementById("ob-shot-back");
    var shotToB = document.getElementById("ob-shot-tob");
    var bPanel = document.getElementById("ob-b-panel");
    var bBack = document.getElementById("ob-b-back");
    var bCount = document.getElementById("ob-b-count");
    var bNote = document.getElementById("ob-b-note");
    var bList = document.getElementById("ob-b-list");
    var bApply = document.getElementById("ob-b-apply");

    var chip = document.getElementById("profile-chip");
    var chipText = document.getElementById("profile-chip-text");
    var chipAvatar = document.getElementById("profile-chip-avatar");
    var yearTag = document.getElementById("academic-year-tag");

    // 위저드 진행 상태 (reconfig=true 이면 프로필 칩 재설정 모드 — 이수내역 보존)
    var state = { step: 1, dept: null, year: null, name: "", reconfig: false, historyOnly: false };
    var bSelected = {};   // B안에서 체크한 과목코드 집합

    // =====================================================================
    // 유틸: 학과 / 학번 / 드래프트
    // =====================================================================
    function findDept(code) {
        return (window.DEPARTMENTS || []).find(function (d) { return d.code === code; });
    }

    function saveDraft() {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                dept: state.dept, year: state.year, name: state.name
            }));
        } catch (e) {}
    }
    function loadDraft() {
        try {
            var raw = localStorage.getItem(DRAFT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    }

    function currentGrade() {
        // 학번(입학년도)으로 현재 학년 추정: 2026 - 입학년도 + 1, 1~4 범위로 보정
        var y = parseInt(state.year, 10);
        if (!y) return 1;
        var g = CURRENT_YEAR - y + 1;
        if (g < 1) g = 1;
        if (g > 4) g = 4;
        return g;
    }

    // =====================================================================
    // STEP 1 — 학과 카드
    // =====================================================================
    function populateDepartments() {
        var depts = window.DEPARTMENTS || [];
        deptList.innerHTML = "";

        if (!state.dept) {
            var firstAvailable = depts.find(function (d) { return d.available; });
            state.dept = firstAvailable ? firstAvailable.code : (depts[0] && depts[0].code);
        }

        depts.forEach(function (d) {
            var card = document.createElement("div");
            card.className = "onboarding-dept" + (!d.available ? " locked" : (d.code === state.dept ? " sel" : ""));
            card.dataset.code = d.code;
            card.innerHTML =
                '<div><div class="dn">' + d.name + '</div>' +
                '<div class="dm">' + (d.available ? (d.curriculumYears.length + '개 학번 교육과정 활성') : "데이터 수집 중 · 준비 중") + '</div></div>' +
                '<div class="rt">' + (!d.available ? '<span class="ob-soon-badge">준비 중</span>' : (d.code === state.dept ? "✓" : "")) + '</div>';
            if (d.available) {
                card.addEventListener("click", function () { pickDept(d.code); });
            }
            deptList.appendChild(card);
        });
        updateDeptHint();
    }

    function pickDept(code) {
        var d = findDept(code);
        if (!d || !d.available) return;
        state.dept = code;
        saveDraft();
        deptList.querySelectorAll(".onboarding-dept").forEach(function (card) {
            if (card.classList.contains("locked")) return;
            var isSel = card.dataset.code === code;
            card.classList.toggle("sel", isSel);
            var rt = card.querySelector(".rt");
            if (rt) rt.textContent = isSel ? "✓" : "";
        });
        updateDeptHint();
    }

    function updateDeptHint() {
        var d = findDept(state.dept);
        deptHint.textContent = d && d.note ? d.note : "";
    }

    // =====================================================================
    // STEP 2 — 학번 칩 + 이름
    // =====================================================================
    function populateYears() {
        var years = window.ADMISSION_YEARS || [];
        yearGrid.innerHTML = "";
        if (!state.year) state.year = years[0];

        years.forEach(function (y) {
            var b = document.createElement("div");
            b.className = "onboarding-yr" + (y === state.year ? " sel" : "");
            b.innerHTML = String(y).slice(2) + "학번<small>" + y + "</small>";
            b.addEventListener("click", function () {
                state.year = y;
                saveDraft();
                populateYears();
                renderPreview();
            });
            yearGrid.appendChild(b);
        });
    }

    function renderPreview() {
        var nm = (nameInput.value || "").trim();
        state.name = nm;
        var d = findDept(state.dept);
        var deptName = d ? d.name : (state.dept || "");
        if (previewAv) previewAv.textContent = nm ? nm.charAt(0) : "학";
        if (previewTitle) previewTitle.textContent = (nm ? nm + " · " : "") + deptName + " · " + (state.year || "") + "학번";
    }

    // =====================================================================
    // 스텝 전환
    // =====================================================================
    function showLanding() {
        landing.classList.add("active");
        wizard.style.display = "none";
        if (wizardFoot) wizardFoot.style.display = "none";
    }

    function goStep(n) {
        state.step = n;
        landing.classList.remove("active");
        wizard.style.display = "";
        if (wizardFoot) wizardFoot.style.display = "";

        var total = state.reconfig ? 2 : 3;
        // 기이수 입력 모달(historyOnly)은 3단계 위저드가 아니라 단일 입력 화면 → 진행 인디케이터 숨김
        var stepsWrap = document.querySelector(".onboarding-steps");
        if (state.historyOnly) {
            if (stepsWrap) stepsWrap.style.display = "none";
            if (stepCount) stepCount.style.display = "none";
        } else {
            if (stepsWrap) stepsWrap.style.display = "";
            if (stepCount) stepCount.style.display = "";
        }
        screens.forEach(function (s, i) { s.classList.toggle("active", i === (n - 1)); });
        stepBars.forEach(function (bar, i) {
            if (!bar) return;
            bar.classList.toggle("on", i <= (n - 1));
            bar.style.display = (i < total) ? "" : "none";
        });
        if (stepCount) stepCount.textContent = n + " / " + total;

        if (n === 1) {
            titleEl.textContent = "먼저, 학과를 선택하세요";
            subEl.textContent = "선택한 학과·학번의 교육과정으로 로드맵이 구성됩니다";
        } else if (n === 2) {
            titleEl.textContent = "입학 학번을 선택하세요";
            subEl.textContent = "해당 학번의 교육과정 편성표가 적용됩니다";
            if (next2Btn) next2Btn.textContent = state.reconfig ? "완료" : "다음";
            renderPreview();
        } else if (n === 3) {
            if (state.historyOnly) {
                titleEl.textContent = "기이수 교과목 입력";
                subEl.textContent = "지금까지 들은 과목을 체크하거나 스크린샷으로 채우세요";
            } else {
                titleEl.textContent = "이수 이력을 알려주세요";
                subEl.textContent = "가장 편한 방법 하나만 고르면 됩니다";
            }
            showHistChoose();
        }
    }

    // =====================================================================
    // STEP 3 — 방법 선택 / A(스크린샷) / B(직접선택) / C(없음)
    // =====================================================================
    function showHistChoose() {
        histChoose.style.display = "";
        shotPanel.classList.remove("active");
        bPanel.classList.remove("active");
        if (obCard) obCard.classList.remove("ob-card-wide");
        // 기이수 입력 진입경로에서는 C("아직 수강한 과목이 없어요") 카드 제외
        if (histC) histC.style.display = state.historyOnly ? "none" : "";
    }
    function showShotPanel() {
        histChoose.style.display = "none";
        shotPanel.classList.add("active");
        bPanel.classList.remove("active");
        var disabled = document.getElementById("ob-ocr-disabled");
        var ocrRoot = document.getElementById("ob-ocr-root");
        if (window.KW_OCR && window.KW_OCR.isEnabled()) {
            // 키 설정됨: OCR 플로우(결과표가 넓어 와이드 카드 사용)
            if (disabled) disabled.style.display = "none";
            if (obCard) obCard.classList.add("ob-card-wide");
            window.KW_OCR.enter({
                getProfile: function () { return { dept: state.dept, year: state.year, name: (nameInput.value || "").trim() }; },
                onApply: function (gradeMap) { finishWithGrades(gradeMap); },
                onBack: function () { showHistChoose(); },
                onFallbackB: function () { showBPanel(); }
            });
        } else {
            // 키 없음: 준비 중 안내 + B 폴백
            if (disabled) disabled.style.display = "";
            if (ocrRoot) ocrRoot.style.display = "none";
            if (obCard) obCard.classList.remove("ob-card-wide");
        }
    }
    function showBPanel() {
        histChoose.style.display = "none";
        shotPanel.classList.remove("active");
        bPanel.classList.add("active");
        if (obCard) obCard.classList.add("ob-card-wide"); // 과목 선택은 와이드 모달
        buildBList();
    }

    function getCurriculumForState() {
        if (typeof window.getCurriculum === "function") {
            return window.getCurriculum(state.dept, state.year) || {};
        }
        return {};
    }

    var bCourseList = []; // 학점 합계 계산용 (현재 교육과정 과목 목록)

    function buildBList() {
        var cur = getCurriculumForState();
        var list = Array.isArray(cur.courses) ? cur.courses : [];
        bCourseList = list;
        var grade = currentGrade();
        bList.innerHTML = "";
        bNote.textContent = "들은 과목을 체크하세요. 지금 건너뛰어도 대시보드에서 언제든 채울 수 있어요.";

        var grid = document.createElement("div");
        grid.className = "ob-b-grid";
        for (var y = 1; y <= 4; y++) {
            var yc = list.filter(function (c) { return c.year === y; });
            grid.appendChild(buildBColumn(y, yc, grade));
        }
        bList.appendChild(grid);
        updateBCount();
    }

    // 학년 열 하나 생성 — 함수 스코프로 감싸 클로저 변수 캡처 버그 방지
    function buildBColumn(y, yc, grade) {
        var col = document.createElement("div");
        col.className = "ob-b-col" + (y === grade ? " me" : "");

        var head = document.createElement("div");
        head.className = "ob-b-col-head";
        var titleWrap = document.createElement("div");
        titleWrap.className = "ob-b-col-title";
        titleWrap.innerHTML =
            '<span class="ob-b-col-y">' + y + '학년' + (y === grade ? ' <span class="ob-b-col-me">현재</span>' : '') + '</span>' +
            '<span class="ob-b-col-n">' + yc.length + '과목</span>';
        head.appendChild(titleWrap);

        var allBtn = null;
        function syncToggle() {
            if (!allBtn) return;
            var all = yc.length > 0 && yc.every(function (c) { return bSelected[c.code]; });
            allBtn.textContent = all ? "전체 해제" : "전체 선택";
            allBtn.classList.toggle("all-on", all);
        }

        if (yc.length > 0) {
            allBtn = document.createElement("button");
            allBtn.type = "button";
            allBtn.className = "ob-b-col-all";
            allBtn.addEventListener("click", function () {
                var all = yc.every(function (c) { return bSelected[c.code]; });
                yc.forEach(function (c) { if (all) delete bSelected[c.code]; else bSelected[c.code] = true; });
                col.querySelectorAll(".ob-b-item").forEach(function (item) {
                    var cb = item.querySelector("input");
                    var sel = !!bSelected[cb.getAttribute("data-code")];
                    cb.checked = sel;
                    item.classList.toggle("on", sel);
                });
                updateBCount();
                syncToggle();
            });
            head.appendChild(allBtn);
        }
        col.appendChild(head);

        if (yc.length === 0) {
            var empty = document.createElement("div");
            empty.className = "ob-b-empty";
            empty.textContent = "편성 과목 없음";
            col.appendChild(empty);
        }

        yc.forEach(function (c) {
            var item = document.createElement("label");
            item.className = "ob-b-item" + (bSelected[c.code] ? " on" : "");
            var typeCls = c.type === "전공 필수" ? "ess" : (c.type === "전공 기초" ? "bas" : "sel");
            item.innerHTML =
                '<input type="checkbox" ' + (bSelected[c.code] ? "checked" : "") + ' data-code="' + c.code + '">' +
                '<span class="ob-b-nm">' + c.name + '</span>' +
                '<span class="ob-b-badge ' + typeCls + '">' + c.credits + '</span>';
            var cb = item.querySelector("input");
            cb.addEventListener("change", function () {
                if (cb.checked) bSelected[c.code] = true; else delete bSelected[c.code];
                item.classList.toggle("on", cb.checked);
                updateBCount();
                syncToggle(); // 개별 변경 시 학년 토글 라벨 동기화
            });
            col.appendChild(item);
        });

        syncToggle();
        return col;
    }

    function updateBCount() {
        var codes = Object.keys(bSelected);
        var n = codes.length;
        var map = {};
        bCourseList.forEach(function (c) { map[c.code] = c; });
        var credits = 0;
        codes.forEach(function (code) { if (map[code]) credits += (map[code].credits || 0); });
        bCount.textContent = n + "과목 선택 · " + credits + "학점";
        bApply.textContent = n ? (n + "과목 반영하고 시작") : "선택 없이 로드맵 시작";
    }

    // =====================================================================
    // 프로필 / 이수내역 적용 (app.js 전역 재사용)
    // =====================================================================
    function applyProfile(profile) {
        window.USER_PROFILE = profile;

        if (typeof window.getCurriculum === "function") {
            var cur = window.getCurriculum(profile.dept, profile.year);
            if (cur) {
                if (Array.isArray(cur.courses)) { try { courses = cur.courses; } catch (e) {} }
                if (Array.isArray(cur.prerequisites)) { try { prerequisites = cur.prerequisites; } catch (e) {} }
                if (cur.tracks) { try { tracks = cur.tracks; } catch (e) {} }
                window.GRAD_REQ = cur.gradReq || 130;
            }
        }

        var d = findDept(profile.dept);
        var deptName = d ? d.name : profile.dept;
        if (yearTag) yearTag.textContent = profile.year + "학번 · " + deptName + " 교육과정";
        if (chip) {
            chip.style.display = "";
            chipText.textContent = (profile.name ? profile.name + " · " : "") + profile.year + " " + deptName;
            chipAvatar.textContent = profile.name ? profile.name.charAt(0) : "학";
        }

        if (typeof initCurriculumSelector === "function") initCurriculumSelector();
        if (typeof updateTrackActiveCourses === "function") updateTrackActiveCourses();
        if (typeof updateRadarChart === "function") updateRadarChart();
        if (typeof drawConnections === "function") setTimeout(drawConnections, 60);
    }

    // 선택한 이수과목을 app.js가 읽는 계약(localStorage + 전역 Set)에 반영
    function applyCompleted(codes) {
        try { localStorage.setItem(COMPLETED_KEY, JSON.stringify(codes)); } catch (e) {}
        try { completedCourses = new Set(codes); } catch (e) {}
        if (typeof saveCompletedCourses === "function") { try { saveCompletedCourses(); } catch (e) {} }
    }

    function saveProfile(profile) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) {}
    }
    function loadProfile() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function buildProfile() {
        return {
            dept: state.dept,
            year: state.year,
            name: (nameInput.value || "").trim()
        };
    }

    // 재설정(프로필 칩) 전용: 프로필만 갱신, 이수내역/코치마크는 건드리지 않음
    function finishProfileOnly() {
        var d = findDept(state.dept);
        if (!d || !d.available || !state.year) return;
        var profile = buildProfile();
        saveProfile(profile);
        applyProfile(profile);
        clearDraft();
        closeOnboarding();
    }

    // 온보딩 최종 완료: 프로필 저장 + (선택 시)이수내역 반영 + 대시보드 갱신 + 코치마크
    function finish(completedCodes) {
        var d = findDept(state.dept);
        if (!d || !d.available || !state.year) return;

        var isFirstTime = !loadProfile();
        var profile = buildProfile();
        saveProfile(profile);
        if (completedCodes) applyCompleted(completedCodes);
        applyProfile(profile);
        clearDraft();
        closeOnboarding();

        if (isFirstTime && !coachDone()) {
            setTimeout(startCoachmarks, 420);
        }
    }

    // A안(스크린샷 OCR) 완료: gradeMap {과목코드: 성적} → 이수 체크 + 성적(과목 귀속) 주입
    function finishWithGrades(gradeMap) {
        var d = findDept(state.dept);
        if (!d || !d.available || !state.year) return;
        gradeMap = gradeMap || {};
        var codes = Object.keys(gradeMap);

        var isFirstTime = !loadProfile();
        var profile = buildProfile();
        saveProfile(profile);
        // OCR 결과는 기존 이수 체크를 지우지 않고 새로 인식된 과목만 병합한다.
        var merged = {};
        try {
            if (typeof completedCourses !== "undefined" && completedCourses) {
                Array.prototype.forEach.call(Array.from(completedCourses), function (code) { merged[code] = true; });
            }
        } catch (e) {}
        codes.forEach(function (code) { merged[code] = true; });
        applyCompleted(Object.keys(merged)); // 이수 체크(localStorage 계약)

        // 성적을 app.js의 과목 귀속 구조에 주입(계산 로직은 건드리지 않음)
        try {
            codes.forEach(function (code) { if (gradeMap[code]) courseGrades[code] = gradeMap[code]; });
            if (typeof saveCourseGrades === "function") saveCourseGrades();
        } catch (e) {}

        applyProfile(profile);
        if (typeof renderMajorGpa === "function") { try { renderMajorGpa(); } catch (e) {} }
        clearDraft();
        closeOnboarding();

        if (isFirstTime && !coachDone()) {
            setTimeout(startCoachmarks, 420);
        }
    }

    // =====================================================================
    // 화면 열기 / 닫기
    // =====================================================================
    function openOnboarding(prefill, opts) {
        opts = opts || {};
        state.reconfig = !!opts.reconfig;
        state.historyOnly = !!opts.historyOnly;
        if (prefill) {
            if (prefill.dept) state.dept = prefill.dept;
            if (prefill.year) state.year = prefill.year;
            if (typeof prefill.name === "string") { state.name = prefill.name; nameInput.value = prefill.name; }
        }
        bSelected = {};
        // 기이수 입력 모달: 기존 이수 체크 상태를 불러와 미리 표시
        if (state.historyOnly) {
            try {
                if (typeof completedCourses !== "undefined" && completedCourses) {
                    Array.prototype.forEach.call(Array.from(completedCourses), function (code) { bSelected[code] = true; });
                }
            } catch (e) {}
        }
        populateDepartments();
        populateYears();

        if (state.historyOnly) {
            goStep(3);            // 학과·학번 단계 생략, 이수 입력만
        } else if (opts.landing) {
            state.step = 1;
            showLanding();
        } else {
            goStep(1);
        }
        overlay.classList.add("visible");
        document.body.classList.add("onboarding-open");
    }

    function closeOnboarding() {
        overlay.classList.remove("visible");
        document.body.classList.remove("onboarding-open");
        if (obCard) obCard.classList.remove("ob-card-wide");
    }

    // =====================================================================
    // 코치마크 (첫 완료 시 1회, 3개)
    // =====================================================================
    var COACH_STEPS = [
        {
            sel: ".status-legend",
            title: "① 노드 상태의 의미",
            body: "각 과목 노드는 색으로 상태를 알려줘요. 이수 완료 · 수강 가능 · 선수과목 미충족 세 가지예요."
        },
        {
            sel: ".sidebar-panel .card",
            title: "② 사이드바 이수율",
            body: "왼쪽 카드에서 졸업 이수율과 전공 평점을 한눈에 확인할 수 있어요."
        },
        {
            sel: "#btn-open-gpa-header",
            title: "③ 성적 계산기",
            body: "여기서 학기별 성적을 입력하면 로드맵과 GPA에 자동으로 반영돼요."
        }
    ];
    var coachIdx = 0;
    var coachOverlay = document.getElementById("coach-overlay");
    var coachRing = document.getElementById("coach-ring");
    var coachTip = document.getElementById("coach-tip");
    var coachStepEl = document.getElementById("coach-step");
    var coachTitle = document.getElementById("coach-title");
    var coachBody = document.getElementById("coach-body");
    var coachNext = document.getElementById("coach-next");
    var coachSkip = document.getElementById("coach-skip");
    var coachDismissChk = document.getElementById("coach-dismiss-chk");

    function coachDone() {
        try { return localStorage.getItem(COACH_KEY) === "1"; } catch (e) { return false; }
    }
    function markCoachDone() {
        try { localStorage.setItem(COACH_KEY, "1"); } catch (e) {}
    }

    function startCoachmarks() {
        if (!coachOverlay) return;
        coachIdx = 0;
        coachOverlay.classList.add("visible");
        renderCoach();
        window.addEventListener("resize", renderCoach);
    }

    function renderCoach() {
        var stepDef = COACH_STEPS[coachIdx];
        var target = stepDef && document.querySelector(stepDef.sel);
        if (!target) { // 대상이 없으면 건너뜀
            if (coachIdx < COACH_STEPS.length - 1) { coachIdx++; renderCoach(); return; }
            endCoachmarks(); return;
        }
        try { target.scrollIntoView({ block: "center", behavior: "auto" }); } catch (e) {}

        var r = target.getBoundingClientRect();
        var pad = 8;
        coachRing.style.top = (r.top - pad) + "px";
        coachRing.style.left = (r.left - pad) + "px";
        coachRing.style.width = (r.width + pad * 2) + "px";
        coachRing.style.height = (r.height + pad * 2) + "px";

        coachStepEl.textContent = (coachIdx + 1) + " / " + COACH_STEPS.length;
        coachTitle.textContent = stepDef.title;
        coachBody.textContent = stepDef.body;
        coachNext.textContent = (coachIdx === COACH_STEPS.length - 1) ? "시작하기" : "다음";

        // 툴팁 위치: 대상 아래(공간 부족 시 위)
        var tipTop = r.bottom + 14;
        var th = coachTip.offsetHeight || 150;
        if (tipTop + th > window.innerHeight - 12) tipTop = Math.max(12, r.top - th - 14);
        var tipLeft = Math.min(Math.max(12, r.left), window.innerWidth - (coachTip.offsetWidth || 300) - 12);
        coachTip.style.top = tipTop + "px";
        coachTip.style.left = tipLeft + "px";
    }

    function endCoachmarks() {
        if (!coachOverlay) return;
        coachOverlay.classList.remove("visible");
        window.removeEventListener("resize", renderCoach);
        if (!coachDismissChk || coachDismissChk.checked) markCoachDone();
    }

    // =====================================================================
    // 이벤트 바인딩
    // =====================================================================
    function init() {
        if (startBtn) startBtn.addEventListener("click", function () { goStep(1); });

        next1Btn.addEventListener("click", function () {
            var d = findDept(state.dept);
            if (!d || !d.available) return;
            goStep(2);
        });
        back1Btn.addEventListener("click", function () { showLanding(); });

        next2Btn.addEventListener("click", function () {
            if (!state.year) return;
            renderPreview();
            if (state.reconfig) { finishProfileOnly(); return; } // 재설정: 이수내역 보존
            goStep(3);
        });
        back2Btn.addEventListener("click", function () { goStep(1); });
        nameInput.addEventListener("input", function () { renderPreview(); saveDraft(); });

        back3Btn.addEventListener("click", function () {
            if (state.historyOnly) { closeOnboarding(); return; } // 기이수 모달은 닫기
            goStep(2);
        });

        // STEP3 방법 카드
        histC.addEventListener("click", function () { finish([]); });               // C: 즉시 완료
        histB.addEventListener("click", function () { showBPanel(); });              // B: 직접 선택
        histA.addEventListener("click", function () { showShotPanel(); });           // A: 스크린샷(준비중)
        shotBack.addEventListener("click", function () { showHistChoose(); });
        shotToB.addEventListener("click", function () { showBPanel(); });            // A → B 폴백
        bBack.addEventListener("click", function () { showHistChoose(); });
        bApply.addEventListener("click", function () { finish(Object.keys(bSelected)); });

        // 프로필 칩 클릭 → 재설정(위저드 1단계부터, 랜딩 생략)
        if (chip) chip.addEventListener("click", function () {
            openOnboarding(window.USER_PROFILE || loadProfile(), { landing: false, reconfig: true });
        });

        // 코치마크 버튼
        if (coachNext) coachNext.addEventListener("click", function () {
            if (coachIdx < COACH_STEPS.length - 1) { coachIdx++; renderCoach(); }
            else endCoachmarks();
        });
        if (coachSkip) coachSkip.addEventListener("click", function () { endCoachmarks(); });

        // 진입 분기
        var saved = loadProfile();
        if (saved) {
            // 재방문: 온보딩 스킵, 바로 적용
            state.dept = saved.dept;
            state.year = saved.year;
            state.name = saved.name || "";
            applyProfile(saved);
        } else {
            // 신규: 드래프트(입력 보존) 복원 후 랜딩부터
            var draft = loadDraft();
            openOnboarding(draft, { landing: true });
        }
    }

    // 외부(app.js 로드맵 버튼)에서 기이수 입력을 모달로 여는 진입점
    window.KW_ONBOARDING = {
        openHistory: function () {
            var saved = (typeof window.USER_PROFILE !== "undefined" && window.USER_PROFILE) ? window.USER_PROFILE : loadProfile();
            if (!saved || !saved.dept || !saved.year) return; // 프로필이 없으면 정식 온보딩이 먼저 진행돼야 함
            openOnboarding(saved, { landing: false, historyOnly: true });
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
