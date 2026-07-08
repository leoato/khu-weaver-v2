    // 상태 관리 (이수한 과목 코드 배열)
    let completedCourses = new Set();
    let currentTrack = "all";
    let currentView = "roadmap"; // roadmap | trends | analysis (F-3 뷰 전환)
    let activeHoverNode = null;
    let mobileRelationCode = null;

    // 로컬 스토리지 제어 함수
    const COMPLETED_STORAGE_KEY = 'khu-weaver-completed';
    function saveCompletedCourses() {
        localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(Array.from(completedCourses)));
    }
    function loadCompletedCourses() {
        const saved = localStorage.getItem(COMPLETED_STORAGE_KEY);
        if (saved) {
            try { completedCourses = new Set(JSON.parse(saved)); } 
            catch(e) { completedCourses = new Set(); }
        }
    }

    // 4. 초기화 및 UI 생성
    window.addEventListener('DOMContentLoaded', () => {
        loadCompletedCourses(); // 초기화 시 가장 먼저 저장된 데이터를 불러옵니다.
        loadCourseGrades();     // 과목 귀속 성적 로드
        migrateLegacyGpa();     // 구 학기기반 성적 데이터가 있으면 1회 변환
        initCurriculumSelector();
        updateTrackActiveCourses();
        initRadarChart();
        drawConnections();
        setupEventListeners();
        renderMajorGpa();       // 전공 평점 초기 표시
    });

    // 수강 체크박스 생성
    function initCurriculumSelector() {
        const container = document.getElementById('curriculum-selector-container');
        container.innerHTML = "";

        // 학년별 그룹화
        for (let year = 1; year <= 4; year++) {
            const yearCourses = courses.filter(c => c.year === year);
            if (yearCourses.length === 0) continue;

            const semGroup = document.createElement('div');
            semGroup.className = 'sem-group';
            
            const semHeader = document.createElement('div');
            semHeader.className = 'sem-header';
            semHeader.innerHTML = `<span>${year}학년 전공 로드맵</span> <span class="sem-badge">${yearCourses.length}개 과목</span>`;
            semGroup.appendChild(semHeader);

            const list = document.createElement('div');
            list.className = 'course-checkbox-list';

            yearCourses.forEach(c => {
                const item = document.createElement('div');
                item.className = 'course-checkbox-item';
                item.dataset.code = c.code;

                const isEssential = c.type === "전공 필수";
                const isBasic = c.type === "전공 기초";
                const badgeClass = isEssential ? 'badge-essential' : (isBasic ? 'badge-basic' : 'badge-selective');

                // 저장된 이수 내역에 있다면 시각적으로 체크 상태 유지
                const isChecked = completedCourses.has(c.code);
                if (isChecked) item.classList.add('checked');

                item.innerHTML = `
                    <div class="course-label-side">
                        <input type="checkbox" id="chk-${c.code}" value="${c.code}" ${isChecked ? 'checked' : ''}>
                        <span class="course-name">${c.name}</span>
                    </div>
                    <div class="course-meta-side">
                        <span class="course-code">${c.code}</span>
                        <span class="course-type-badge ${badgeClass}">${c.type} (${c.credits}학점)</span>
                        <span class="course-grade-wrap">
                            <select class="course-grade-select" data-grade-code="${c.code}" title="성적 (전공 평점 반영)">${gradeOptionsHtml(courseGrades[c.code])}</select>
                        </span>
                    </div>
                `;
                list.appendChild(item);
            });

            semGroup.appendChild(list);
            container.appendChild(semGroup);
        }
        if (typeof renderMajorGpa === 'function') renderMajorGpa();
    }

    // 트랙별 정렬 우선순위 헬퍼 함수 (같은 학년 내에서 트랙별로 묶어서 보여주기 위한 정렬 키)
    function getTrackSlotIndex(c) {
        if (c.isMinor) return 5; // 비주요/기타 과목은 정렬상 맨 뒤로

        switch(c.track) {
            case "MATH":
            case "PHYS":
                return 0;
            case "CSY":
                return 1;
            case "SW":
                return 2;
            case "COMP":
                return 3;
            case "CS":
                return 4;
            default:
                return 0;
        }
    }

    // 특정 과목의 "직접" 선수과목 코드 목록 (prerequisites 규칙에서 target=code인 항목들의 prereqs 병합)
    function getDirectPrereqs(code) {
        let result = [];
        prerequisites.forEach(rule => {
            if (rule.target === code) result = result.concat(rule.prereqs);
        });
        return result;
    }

    // 노드 상태 3종 판정: done(이수완료) / avail(수강가능=직접 선수과목 전부 이수) / locked(선수과목 미충족)
    function getCourseState(code) {
        if (completedCourses.has(code)) return 'done';
        const prereqs = getDirectPrereqs(code);
        if (prereqs.length === 0) return 'avail';
        return prereqs.every(p => completedCourses.has(p)) ? 'avail' : 'locked';
    }

    // 재귀적으로 모든 선수과목 체인을 추적하는 DFS 함수
    function getRecursivePrereqs(nodeCode, visited = new Set()) {
        let relations = [];
        if (visited.has(nodeCode)) return relations;
        visited.add(nodeCode);

        prerequisites.forEach(rule => {
            if (rule.target === nodeCode) {
                rule.prereqs.forEach(p => {
                    relations.push({ parent: p, child: nodeCode });
                    relations = relations.concat(getRecursivePrereqs(p, visited));
                });
            }
        });
        return relations;
    }

    // 재귀적으로 모든 후수과목 체인을 추적하는 DFS 함수
    function getRecursiveFollowups(nodeCode, visited = new Set()) {
        let relations = [];
        if (visited.has(nodeCode)) return relations;
        visited.add(nodeCode);

        prerequisites.forEach(rule => {
            if (rule.prereqs.includes(nodeCode)) {
                relations.push({ parent: nodeCode, child: rule.target });
                relations = relations.concat(getRecursiveFollowups(rule.target, visited));
            }
        });
        return relations;
    }

    // 타임라인 내에 과목 카드 동적 로드 (학년 레인에 컴팩트 카드를 자유배치 — 4개 학년이 한 화면에 들어오도록
    // 고정 6슬롯 그리드 대신, 트랙 우선순위로 정렬한 뒤 순서대로 쌓는 방식으로 전환)
    function isMobileRoadmap() {
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    function getCourseByCode(code) {
        return courses.find(c => c.code === code);
    }

    function uniqueRelationCodes(relations, key) {
        return Array.from(new Set(relations.map(r => r[key]).filter(Boolean)));
    }

    function relationChipHtml(code, type) {
        const course = getCourseByCode(code);
        const label = course ? course.name : code;
        return `<button class="mrb-chip ${type}" type="button" data-code="${code}">${label}</button>`;
    }

    function relationGroupHtml(label, codes, type) {
        const content = codes.length
            ? codes.map(code => relationChipHtml(code, type)).join('')
            : '<span class="mrb-empty">연결된 과목이 없어요</span>';
        return `
            <section class="mrb-group ${type}">
                <span class="mrb-label">${label}</span>
                <div class="mrb-chips">${content}</div>
            </section>
        `;
    }

    function clearMobileRelationPanel() {
        mobileRelationCode = null;
        document.querySelectorAll('.mobile-relation-panel, .mobile-relation-board').forEach(panel => panel.remove());
        document.querySelectorAll('.timeline-course-card.mobile-relation-open, .timeline-course-card.mobile-relation-dim, .timeline-course-card.mobile-related-prereq, .timeline-course-card.mobile-related-followup').forEach(card => {
            card.classList.remove('mobile-relation-open');
            card.classList.remove('mobile-relation-dim');
            card.classList.remove('mobile-related-prereq');
            card.classList.remove('mobile-related-followup');
        });
    }

    function applyMobileRelationClasses(code, prereqCodes, followupCodes) {
        const prereqSet = new Set(prereqCodes);
        const followupSet = new Set(followupCodes);

        document.querySelectorAll('.timeline-course-card').forEach(otherCard => {
            const otherCode = otherCard.dataset.code;
            otherCard.classList.remove('mobile-relation-open', 'mobile-relation-dim', 'mobile-related-prereq', 'mobile-related-followup');

            if (otherCode === code) {
                otherCard.classList.add('mobile-relation-open');
            } else if (prereqSet.has(otherCode)) {
                otherCard.classList.add('mobile-related-prereq');
            } else if (followupSet.has(otherCode)) {
                otherCard.classList.add('mobile-related-followup');
            } else {
                otherCard.classList.add('mobile-relation-dim');
            }
        });
    }

    function jumpToRelationCourse(code) {
        const target = document.getElementById(`t-card-${code}`);
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('mobile-jump-highlight');
        void target.offsetWidth;
        target.classList.add('mobile-jump-highlight');
        window.setTimeout(() => target.classList.remove('mobile-jump-highlight'), 1200);
    }

    function toggleMobileRelationPanel(card) {
        const code = card.dataset.code;
        if (!code) return;

        if (mobileRelationCode === code) {
            clearMobileRelationPanel();
            return;
        }

        const prereqCodes = uniqueRelationCodes(getRecursivePrereqs(code), 'parent');
        const followupCodes = uniqueRelationCodes(getRecursiveFollowups(code), 'child');
        const hasAnyRelation = prereqCodes.length > 0 || followupCodes.length > 0;
        const selected = getCourseByCode(code);
        const selectedName = selected ? selected.name : code;
        const selectedMeta = selected ? `${selected.code} · ${selected.credits}학점 · ${selected.track}` : code;

        clearMobileRelationPanel();
        mobileRelationCode = code;
        applyMobileRelationClasses(code, prereqCodes, followupCodes);

        const panel = document.createElement('div');
        panel.className = 'mobile-relation-board';
        panel.dataset.forCode = code;
        panel.innerHTML = `
            <div class="mrb-head">
                <span>관계 집중 보기</span>
                <button class="mrb-close" type="button" aria-label="관계 보드 닫기">닫기</button>
            </div>
            ${hasAnyRelation
                ? `<div class="mrb-map">
                    ${relationGroupHtml('선수 과목', prereqCodes, 'prereq')}
                    <div class="mrb-center">
                        <span class="mrb-center-kicker">선택 과목</span>
                        <strong>${selectedName}</strong>
                        <small>${selectedMeta}</small>
                    </div>
                    ${relationGroupHtml('후수 과목', followupCodes, 'followup')}
                </div>`
                : `<div class="mrb-single">
                    <div class="mrb-center">
                        <span class="mrb-center-kicker">선택 과목</span>
                        <strong>${selectedName}</strong>
                        <small>${selectedMeta}</small>
                    </div>
                    <div class="mrb-no-links">연결된 선수/후수 과목이 없어요</div>
                </div>`}
        `;

        card.insertAdjacentElement('afterend', panel);

        panel.querySelector('.mrb-close').addEventListener('click', (e) => {
            e.stopPropagation();
            clearMobileRelationPanel();
        });
        panel.querySelectorAll('.mrb-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                jumpToRelationCourse(chip.dataset.code);
            });
        });
    }

    function updateTrackActiveCourses() {
        mobileRelationCode = null;
        // 각 학년 레인 초기화
        for (let y = 1; y <= 4; y++) {
            const col = document.getElementById(`col-year-${y}`);
            if (col) col.innerHTML = "";
        }

        // ALL 탭 대응 클래스 처리
        if (currentTrack === "all") {
            document.body.classList.add('track-all');
        } else {
            document.body.classList.remove('track-all');
        }

        const trackCourses = currentTrack === "all"
            ? courses.map(c => c.code)
            : courses.filter(c => c.type === "전공 필수" || c.type === "전공 기초" || (tracks[currentTrack] || []).includes(c.code)).map(c => c.code);

        // 학년별로 묶고, 트랙 우선순위 → 과목코드 순으로 정렬(같은 계열 과목끼리 인접하게)
        for (let y = 1; y <= 4; y++) {
            const col = document.getElementById(`col-year-${y}`);
            if (!col) continue;

            const yearCourses = courses
                .filter(c => c.year === y)
                .slice()
                .sort((a, b) => {
                    const d = getTrackSlotIndex(a) - getTrackSlotIndex(b);
                    return d !== 0 ? d : a.code.localeCompare(b.code);
                });

            yearCourses.forEach(c => {
                const card = document.createElement('div');
                card.className = 'timeline-course-card';
                card.id = `t-card-${c.code}`;
                card.dataset.code = c.code;
                card.dataset.trackType = c.track;

                const isTrackActive = trackCourses.includes(c.code);
                if (isTrackActive) {
                    card.classList.add('active-in-track');
                }

                // 노드 상태 3종 반영: 이수완료 / 수강가능 / 선수과목 미충족
                const state = getCourseState(c.code);
                if (state === 'done') {
                    card.classList.add('checked-course');
                } else if (state === 'avail') {
                    card.classList.add('course-avail');
                } else {
                    card.classList.add('course-locked');
                }

                card.innerHTML = `
                    <div class="relation-badge"></div>
                    <span class="t-card-code">${c.code}</span>
                    <div class="t-card-name">${c.name}</div>
                    <div class="t-card-meta">
                        <span>${c.credits}학점</span>
                        <span class="t-card-track">${c.track}</span>
                    </div>
                `;
                col.appendChild(card);
            });
        }

        // 탭 활성화 갱신
        document.querySelectorAll('.track-btn').forEach(btn => {
            if (btn.dataset.track === currentTrack) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 카드 렌더링 후 선 그리기
        setTimeout(drawConnections, 50);

        // 카드들 호버/클릭 이벤트 새로 바인딩
        bindCardHoverEvents();
    }

    // 선후수 연결 관계선 SVG 그리기 (재귀 연쇄 하이라이트 및 물결 애니메이션 탑재)
    function drawConnections() {
        const svg = document.getElementById('svg-canvas');
        
        // path 다 지우기
        const paths = svg.querySelectorAll('path');
        paths.forEach(p => p.remove());

        const wrapper = document.querySelector('.roadmap-timeline-wrapper');
        const wrapperRect = wrapper.getBoundingClientRect();

        // 호버 연관 관계 스캔 (재귀 추적)
        let activeRelations = [];
        let activePrereqCodes = new Set();
        let activeFollowupCodes = new Set();

        if (activeHoverNode) {
            const prereqPaths = getRecursivePrereqs(activeHoverNode);
            const followupPaths = getRecursiveFollowups(activeHoverNode);
            
            activeRelations = [...prereqPaths, ...followupPaths];
            
            prereqPaths.forEach(p => activePrereqCodes.add(p.parent));
            followupPaths.forEach(p => activeFollowupCodes.add(p.child));
        }

        const trackCourses = currentTrack === "all" 
            ? courses.map(c => c.code) 
            : courses.filter(c => c.type === "전공 필수" || c.type === "전공 기초" || (tracks[currentTrack] || []).includes(c.code)).map(c => c.code);

        // === [핵심 가독성 혁신: 시작/도착점 수직 다중 포트 분산 분배 알고리즘] ===
        let portAllocations = {};
        
        // Prerequisites 의존성을 돌면서 각 과목 노드별 총 입/출력 연결선 개수를 사전에 파악합니다
        prerequisites.forEach(rule => {
            const targetCard = document.getElementById(`t-card-${rule.target}`);
            if (!targetCard) return;

            rule.prereqs.forEach(prereqCode => {
                const prereqCard = document.getElementById(`t-card-${prereqCode}`);
                if (!prereqCard) return;

                // prereqCode는 나가는 포트 (Output Port)
                if (!portAllocations[prereqCode]) {
                    portAllocations[prereqCode] = { inTotal: 0, outTotal: 0, inCurrent: 0, outCurrent: 0 };
                }
                portAllocations[prereqCode].outTotal++;

                // targetCode는 들어오는 포트 (Input Port)
                if (!portAllocations[rule.target]) {
                    portAllocations[rule.target] = { inTotal: 0, outTotal: 0, inCurrent: 0, outCurrent: 0 };
                }
                portAllocations[rule.target].inTotal++;
            });
        });

        let sameYearCount = 0; // 동일 학년 연결선 겹침 방지 다단계 카운터 초기화
        prerequisites.forEach(rule => {
            const targetCard = document.getElementById(`t-card-${rule.target}`);
            if (!targetCard) return;

            rule.prereqs.forEach(prereqCode => {
                const prereqCard = document.getElementById(`t-card-${prereqCode}`);
                if (!prereqCard) return;

                const tRect = targetCard.getBoundingClientRect();
                const pRect = prereqCard.getBoundingClientRect();

                // === [동일 학년 내부 선수 교과 연계선 여백 우회 분기] ===
                const isSameYear = prereqCard.closest('.timeline-year-col') === targetCard.closest('.timeline-year-col');

                let x1, y1, x2, y2, controlOffset, pathData;

                if (isSameYear) {
                    sameYearCount++;
                    const sameYearOffset = (sameYearCount % 5) * 8; // 8px씩 X축 격차를 만들어 동일 학년 선 겹침 차단
                    
                    // 동일 학년 선수과목 연계선은 카드를 관통하지 않고 왼쪽 바깥쪽 여백을 따라 수직 우회하도록 제어
                    // X좌표도 다단계로 미세하게 격차 분산하여 평행선 다발 형태로 표시
                    x1 = pRect.left - wrapperRect.left - 4 - (sameYearCount % 5) * 3;
                    x2 = tRect.left - wrapperRect.left - 6 - (sameYearCount % 5) * 3;

                    const outIdx = portAllocations[prereqCode].outCurrent++;
                    const outTotal = portAllocations[prereqCode].outTotal;
                    const outOffset = outTotal > 1 ? ((outIdx / (outTotal - 1)) - 0.5) * Math.min(16, outTotal * 3) : 0;
                    y1 = (pRect.top + pRect.bottom) / 2 - wrapperRect.top + outOffset;

                    const inIdx = portAllocations[rule.target].inCurrent++;
                    const inTotal = portAllocations[rule.target].inTotal;
                    const inOffset = inTotal > 1 ? ((inIdx / (inTotal - 1)) - 0.5) * Math.min(16, inTotal * 3) : 0;
                    y2 = (tRect.top + tRect.bottom) / 2 - wrapperRect.top + inOffset;

                    const dy = Math.abs(y2 - y1);
                    // 왼쪽 바깥(음수 방향)으로 제어점을 다단계 오프셋과 함께 배치하여 자연스럽게 왼쪽을 돌아서 떨어지도록 튜닝
                    controlOffset = -Math.min(70, 24 + dy * 0.08 + sameYearOffset);
                    pathData = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 + controlOffset} ${y2}, ${x2} ${y2}`;
                } else {
                    // 타 학년 간 연결선은 기존의 표준 오른쪽 -> 왼쪽 흐름 유지
                    x1 = pRect.right - wrapperRect.left;
                    x2 = tRect.left - wrapperRect.left - 6;

                    const outIdx = portAllocations[prereqCode].outCurrent++;
                    const outTotal = portAllocations[prereqCode].outTotal;
                    const outOffset = outTotal > 1 ? ((outIdx / (outTotal - 1)) - 0.5) * Math.min(24, outTotal * 4.5) : 0;
                    y1 = (pRect.top + pRect.bottom) / 2 - wrapperRect.top + outOffset;

                    const inIdx = portAllocations[rule.target].inCurrent++;
                    const inTotal = portAllocations[rule.target].inTotal;
                    const inOffset = inTotal > 1 ? ((inIdx / (inTotal - 1)) - 0.5) * Math.min(24, inTotal * 4.5) : 0;
                    y2 = (tRect.top + tRect.bottom) / 2 - wrapperRect.top + inOffset;

                    const dist = x2 - x1;
                    controlOffset = dist * 0.35;
                    pathData = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
                }

                const bothCompleted = completedCourses.has(prereqCode) && completedCourses.has(rule.target);
                const prereqCompletedOnly = completedCourses.has(prereqCode);
                
                let strokeColor = 'rgba(0, 0, 0, 0.05)'; 
                let strokeWidth = 1.5;
                let dashArray = '3,3';
                let isActiveLine = false;
                let lineOpacity = 1.0;

                if (activeHoverNode) {
                    // 호버 중일 때 비연관 선은 완전히 아웃포커스 처리
                    const isRelated = activeRelations.some(r => r.parent === prereqCode && r.child === rule.target);
                    if (!isRelated) {
                        lineOpacity = 0.02; /* 거의 안보이게 처리하여 노이즈 차단 */
                    } else {
                        isActiveLine = true;
                        const isPrereqChain = activePrereqCodes.has(prereqCode) || prereqCode === activeHoverNode;
                        strokeColor = isPrereqChain ? 'var(--khu-gold)' : 'var(--accent-blue)';
                        strokeWidth = 2.5;
                        dashArray = 'none';
                    }
                } else {
                    // 평상시: 선택된 분야 트랙일 경우 아름답게 실시간 하이라이팅
                    const isTrackLine = currentTrack !== "all" && trackCourses.includes(prereqCode) && trackCourses.includes(rule.target);
                    if (isTrackLine) {
                        strokeColor = 'var(--khu-burgundy-light)';
                        strokeWidth = 2.2;
                        dashArray = 'none';
                        lineOpacity = 0.85;
                    } else {
                        // 전체보기 모드이거나 비활성 상태일 때는 매우 얇고 투명한 라인으로 처리하여 노이즈를 완벽 차단
                        lineOpacity = currentTrack === "all" ? 0.35 : 0.04;
                        strokeColor = bothCompleted ? 'var(--khu-burgundy-light)' : 'rgba(0, 0, 0, 0.05)';
                        strokeWidth = bothCompleted ? 1.5 : 1.0;
                        dashArray = bothCompleted ? 'none' : '3,3';
                    }
                }



                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathData);
                path.setAttribute('stroke', strokeColor);
                path.setAttribute('stroke-width', strokeWidth);
                path.setAttribute('fill', 'none');
                path.setAttribute('marker-end', 'url(#arrow)');
                path.style.opacity = lineOpacity;
                path.style.transition = 'opacity 0.25s ease, stroke 0.25s ease, stroke-width 0.25s ease';
                
                if (isActiveLine) {
                    path.classList.add('active-connection');
                } else if (dashArray !== 'none') {
                    path.setAttribute('stroke-dasharray', dashArray);
                }
                svg.appendChild(path);
            });
        });
    }

    // 노드 하나를 기준으로 선후수 체인 하이라이트를 적용
    function applyHighlight(code) {
        activeHoverNode = code;

        // 재귀적 선수/후수 체인 획득
        const prereqRelations = getRecursivePrereqs(code);
        const followupRelations = getRecursiveFollowups(code);

        const prereqCodes = new Set(prereqRelations.map(r => r.parent));
        const followupCodes = new Set(followupRelations.map(r => r.child));

        // 모든 노드 상태 스타일링 및 관계 뱃지 텍스트 렌더링
        document.querySelectorAll('.timeline-course-card').forEach(otherCard => {
            const otherCode = otherCard.dataset.code;
            const badge = otherCard.querySelector('.relation-badge');

            if (otherCode === code) {
                otherCard.classList.add('highlight-focus');
                if (badge) badge.innerText = "선택 과목";
            } else if (prereqCodes.has(otherCode)) {
                otherCard.classList.add('highlight-prereq');
                if (badge) badge.innerText = "선수 교과";
            } else if (followupCodes.has(otherCode)) {
                otherCard.classList.add('highlight-followup');
                if (badge) badge.innerText = "후수 교과";
            } else {
                otherCard.classList.add('fade-out-node');
            }
        });

        // 관계선 실시간 재배치 및 물결 애니메이션 가동
        drawConnections();
    }

    // 하이라이트 완전 해제
    function clearHighlight() {
        activeHoverNode = null;
        document.querySelectorAll('.timeline-course-card').forEach(otherCard => {
            otherCard.classList.remove('highlight-focus');
            otherCard.classList.remove('highlight-prereq');
            otherCard.classList.remove('highlight-followup');
            otherCard.classList.remove('fade-out-node');

            const badge = otherCard.querySelector('.relation-badge');
            if (badge) badge.innerText = "";
        });
        drawConnections();
    }

    // 클릭으로 고정(핀)된 노드 — 있으면 마우스가 빠져나가도 하이라이트 유지
    let pinnedNode = null;

    // 지능형 연쇄 호버/클릭 이벤트 핸들러 바인딩 (다단계 재귀 연쇄 및 동적 뱃지 렌더링)
    function bindCardHoverEvents() {
        document.querySelectorAll('.timeline-course-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                if (pinnedNode) return; // 핀 고정 중엔 다른 노드 호버 미리보기를 하지 않음
                if (isMobileRoadmap()) return;
                applyHighlight(card.dataset.code);
            });

            card.addEventListener('mouseleave', () => {
                if (pinnedNode) return; // 핀 고정된 하이라이트 유지
                if (isMobileRoadmap()) return;
                clearHighlight();
            });

            // 클릭: 같은 노드를 다시 누르면 해제, 아니면 그 노드로 고정(핀)
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isMobileRoadmap()) {
                    if (pinnedNode) {
                        pinnedNode = null;
                        clearHighlight();
                    }
                    toggleMobileRelationPanel(card);
                    return;
                }
                const code = card.dataset.code;
                if (pinnedNode === code) {
                    pinnedNode = null;
                    clearHighlight();
                } else {
                    pinnedNode = code;
                    applyHighlight(code);
                }
            });
        });
    }

    // 빈 공간(카드 바깥) 클릭 시 핀 고정 해제
    document.addEventListener('click', (e) => {
        if (isMobileRoadmap() && !e.target.closest('.timeline-course-card') && !e.target.closest('.mobile-relation-panel, .mobile-relation-board')) {
            clearMobileRelationPanel();
        }
        if (pinnedNode) {
            pinnedNode = null;
            clearHighlight();
        }
    });

    // 의존성 실시간 검증 (Prerequisite Dependency Validation)
    function validateDependencies() {
        const alertPanel = document.getElementById('alert-panel');
        const alertTitle = document.getElementById('alert-title');
        const alertMsg = document.getElementById('alert-msg');
        
        let errors = [];

        prerequisites.forEach(rule => {
            // 학생이 후수 교과를 선택했는데 선수 필수 교과가 빠진 경우 감지
            if (completedCourses.has(rule.target)) {
                const missingPrereqs = rule.prereqs.filter(p => !completedCourses.has(p));
                if (missingPrereqs.length > 0) {
                    const targetName = courses.find(c => c.code === rule.target).name;
                    const missingNames = missingPrereqs.map(p => courses.find(c => c.code === p).name).join(', ');
                    errors.push(`'${targetName}'을 수강하기 전에 선수 과목인 '${missingNames}'을 반드시 먼저 이수해야 합니다.`);
                }
            }
        });

        if (errors.length > 0) {
            alertTitle.innerHTML = `⚠️ [학업 이수 체계 오류 감지 - 총 ${errors.length}건]`;
            alertMsg.innerHTML = errors[0]; // 대표 에러 하나만 출력
            alertPanel.style.display = 'block';
        } else {
            alertPanel.style.display = 'none';
        }
    }

    // 5. Canvas Radar Chart 직접 구현 (외부 라이브러리 프리)
    let radarContext = null;
    function initRadarChart() {
        const canvas = document.getElementById('radarChart');
        radarContext = canvas.getContext('2d');
        updateRadarChart();
    }

    function updateRadarChart() {
        if (!radarContext) return;
        
        const canvas = document.getElementById('radarChart');
        const ctx = radarContext;
        
        // 클리어
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 95;

        // 역량 카테고리 정의
        const categories = [
            { name: "회로설계 (CSY)", track: "CSY" },
            { name: "반도체소자 (SW)", track: "SW" },
            { name: "임베디드/SW (COMP)", track: "COMP" },
            { name: "통신/신호 (CS)", track: "CS" }
        ];

        // 각 카테고리별 이수 평점/성취도 계산
        let scores = [10, 10, 10, 10]; // 기본 최소값 10%
        
        categories.forEach((cat, idx) => {
            const catCourses = courses.filter(c => c.track === cat.track);
            const completedCatCourses = catCourses.filter(c => completedCourses.has(c.code));
            
            if (catCourses.length > 0) {
                const ratio = completedCatCourses.length / catCourses.length;
                scores[idx] = Math.max(10, Math.round(ratio * 100)); // 10% ~ 100% 범위
            }
        });

        // 뒷배경 방사형 가이드라인 그리기 (밝은 모드에 맞게 어두운 연회색선으로 튜닝)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        
        // 4단계 가이드 링
        for (let r = 1; r <= 4; r++) {
            const currentR = radius * (r / 4);
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI / 2) * i - Math.PI / 4; // 45도 회전시켜서 그리기
                const x = centerX + currentR * Math.cos(angle);
                const y = centerY + currentR * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // 중심선
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = (Math.PI / 2) * i - Math.PI / 4;
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
        }
        ctx.stroke();

        // 텍스트 라벨 배치 (선명한 다크 차콜로 드로잉)
        ctx.fillStyle = 'hsl(220, 25%, 12%)';
        ctx.font = 'bold 11px Noto Sans KR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        categories.forEach((cat, i) => {
            const angle = (Math.PI / 2) * i - Math.PI / 4;
            const x = centerX + (radius + 24) * Math.cos(angle);
            const y = centerY + (radius + 15) * Math.sin(angle);
            ctx.fillText(cat.name, x, y);
        });

        // 실제 획득한 성취도 폴리곤 그리기
        ctx.fillStyle = 'hsla(343, 66%, 33%, 0.18)'; /* 밝은 버건디 반투명 채우기 */
        ctx.strokeStyle = 'var(--khu-burgundy-light)'; /* 선명한 버건디 테두리 */
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        categories.forEach((cat, i) => {
            const angle = (Math.PI / 2) * i - Math.PI / 4;
            const currentR = radius * (scores[i] / 100);
            const x = centerX + currentR * Math.cos(angle);
            const y = centerY + currentR * Math.sin(angle);
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 데이터 밸류 노드 포인트 그리기
        categories.forEach((cat, i) => {
            const angle = (Math.PI / 2) * i - Math.PI / 4;
            const currentR = radius * (scores[i] / 100);
            const x = centerX + currentR * Math.cos(angle);
            const y = centerY + currentR * Math.sin(angle);
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'var(--khu-gold)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        });

        // 학점 통계 수치 실시간 업데이트
        let totalCredits = 0;
        completedCourses.forEach(code => {
            const c = courses.find(item => item.code === code);
            if (c) totalCredits += c.credits;
        });

        document.getElementById('stat-completed-credits').innerHTML = `${totalCredits}<span>학점</span>`;
        const gradReq = window.GRAD_REQ || 130; // 설정된 졸업요건이 없으면 130으로 폴백
        const rate = Math.min(100, Math.round((totalCredits / gradReq) * 100));
        document.getElementById('stat-completion-rate').innerHTML = `${rate}<span>%</span>`;
    }

    // === F-3: 뷰 전환 (로드맵 / 진로 트렌드 / 내 분석) ===
    const VIEW_HEADINGS = {
        roadmap:  { title: "나의 전공 로드맵", sub: "노드를 클릭/호버하면 선후수 관계와 상세 정보를 확인할 수 있습니다." },
        trends:   { title: "산업계 수요 기술 트렌드", sub: "전자·전기 계열 진로·취업 및 인력 수요 데이터 (출처 표기)" },
        analysis: { title: "내 학업 분석", sub: "졸업 이수율 · 전공 평점 · 역량 레이더를 한눈에 확인합니다." }
    };

    function switchView(view) {
        currentView = view;

        // 패널 표시 전환
        const panels = { roadmap: 'roadmap-view', trends: 'trends-view', analysis: 'analysis-view' };
        Object.keys(panels).forEach(k => {
            const el = document.getElementById(panels[k]);
            if (el) el.style.display = (k === view) ? '' : 'none';
        });

        // 헤딩 텍스트 + 상태 범례(로드맵 전용) 표시 전환
        const h = VIEW_HEADINGS[view] || VIEW_HEADINGS.roadmap;
        const titleEl = document.getElementById('view-title');
        const subEl = document.getElementById('view-sub');
        const legendEl = document.getElementById('roadmap-legend');
        if (titleEl) titleEl.textContent = h.title;
        if (subEl) subEl.textContent = h.sub;
        if (legendEl) legendEl.style.display = (view === 'roadmap') ? '' : 'none';

        // 탭 활성화 상태
        document.querySelectorAll('.track-btn').forEach(b => b.classList.remove('active'));
        if (view === 'roadmap') {
            updateTrackActiveCourses(); // currentTrack 버튼 활성 + 로드맵 재렌더
        } else {
            const vb = document.querySelector('.track-btn[data-view="' + view + '"]');
            if (vb) vb.classList.add('active');
            if (view === 'trends') renderTrends();
            if (view === 'analysis') { updateRadarChart(); renderMajorGpa(); renderGpaModalList(); }
        }
    }

    // 진로 트렌드 탭: js/data/TRENDS.js(KW_TRENDS)로 세로 막대그래프 + 출처 + 분석 렌더
    // 수치·분석·출처는 TRENDS.js 값을 그대로 사용(임의 창작 금지). 단위가 섞이므로 단위별로 그룹핑해 각 그룹 스케일로 표시.
    function renderTrends() {
        const box = document.getElementById('trends-body');
        if (!box) return;
        const data = window.KW_TRENDS;
        if (!data || !Array.isArray(data.items) || data.items.length === 0) {
            box.innerHTML = '<div class="trends-empty">출처 수집 중입니다. (js/data/TRENDS.js 준비되면 표시됩니다)</div>';
            return;
        }

        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const items = data.items;

        // 전역 인덱스(출처 목록과 막대를 번호로 연결)
        items.forEach((it, i) => { it._idx = i + 1; });

        // 단위별 그룹핑 (예: "%", "만 명")
        const groups = {};
        items.forEach(it => { const u = it.unit || ''; (groups[u] = groups[u] || []).push(it); });

        const UNIT_LABEL = { '%': '취업률·비율 (%)', '만 명': '인력 수요·부족 규모 (만 명)' };

        let html = '';
        html += '<p class="trends-lead">' + esc(data.updated ? ('기준: ' + data.updated + ' · ') : '') + '아래 수치·분석·출처는 모두 실데이터에 근거합니다. 막대 번호는 하단 출처와 대응됩니다.</p>';

        Object.keys(groups).forEach(unit => {
            const g = groups[unit];
            const max = Math.max.apply(null, g.map(it => Number(it.value) || 0)) || 1;
            html += '<div class="trend-group">';
            html += '<div class="trend-group-title">' + esc(UNIT_LABEL[unit] || ('단위: ' + unit)) + '</div>';
            html += '<div class="trend-group-sub">막대 높이는 그룹 내 최댓값 대비 상대 크기입니다.</div>';
            html += '<div class="trend-vchart">';
            g.forEach(it => {
                const v = Number(it.value) || 0;
                const pct = Math.max(3, Math.round((v / max) * 100));
                html += '<div class="tvbar">' +
                    '<span class="tvbar-val">' + esc(it.value) + esc(it.unit || '') + '</span>' +
                    '<div class="tvbar-fill" style="height:' + pct + '%"></div>' +
                    '<span class="tvbar-label"><span class="tv-idx">' + it._idx + '</span>' + esc(it.label) + '</span>' +
                    '</div>';
            });
            html += '</div></div>';
        });

        // 분석 텍스트 (analysis 배열 그대로)
        if (Array.isArray(data.analysis) && data.analysis.length) {
            html += '<div class="trend-analysis"><div class="trend-analysis-title">분석</div><ul>';
            data.analysis.forEach(line => { html += '<li>' + esc(line) + '</li>'; });
            html += '</ul></div>';
        }

        // 출처 표기 (기관명·연도·링크)
        html += '<div class="trend-sources"><div class="trend-sources-title">출처</div>';
        items.forEach(it => {
            const link = it.url ? ' · <a href="' + esc(it.url) + '" target="_blank" rel="noopener">링크</a>' : '';
            html += '<div class="trend-src-row"><span class="ts-idx">' + it._idx + '</span>' +
                esc(it.label) + ' — ' + esc(it.source) + link + '</div>';
        });
        html += '</div>';

        box.innerHTML = html;
    }

    // 6. 이벤트 핸들러 바인딩
    function setupEventListeners() {
        // 체크박스 클릭 / 성적 셀렉트 변경 핸들러 (이벤트 위임)
        document.getElementById('curriculum-selector-container').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const code = e.target.value;
                const wrapper = e.target.closest('.course-checkbox-item');

                if (e.target.checked) {
                    completedCourses.add(code);
                    if (wrapper) wrapper.classList.add('checked');
                } else {
                    completedCourses.delete(code);
                    if (wrapper) wrapper.classList.remove('checked');
                    // 이수 해제 시 해당 과목 성적도 함께 제거
                    if (courseGrades[code]) { delete courseGrades[code]; saveCourseGrades(); syncGradeSelects(code, ""); }
                }
                saveCompletedCourses();

                // 전체 시각화 및 검증 동시 갱신
                validateDependencies();
                updateTrackActiveCourses();
                updateRadarChart();
                renderMajorGpa();
                renderGpaModalList();
            } else if (e.target.classList && e.target.classList.contains('course-grade-select')) {
                // 이수 목록에서 성적 선택 → 과목에 귀속
                setCourseGrade(e.target.dataset.gradeCode, e.target.value);
            }
        });

        // 행(카드) 전체 클릭으로 이수 체크 토글 (성적 드롭다운 클릭은 토글에서 제외)
        document.getElementById('curriculum-selector-container').addEventListener('click', (e) => {
            if (e.target.closest('.course-grade-select')) return; // 드롭다운 조작은 체크 토글로 이어지지 않도록 전파 차단
            if (e.target.tagName === 'INPUT') return; // 체크박스 자체 클릭은 change 이벤트가 이미 처리(중복 토글 방지)
            const item = e.target.closest('.course-checkbox-item');
            if (!item) return;
            const chk = item.querySelector('input[type="checkbox"]');
            if (!chk) return;
            chk.checked = !chk.checked;
            chk.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 분야 트랙 / 뷰 전환 탭 클릭 핸들러
        document.querySelectorAll('.track-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.view) {
                    switchView(btn.dataset.view);
                } else {
                    currentTrack = btn.dataset.track;
                    switchView('roadmap');
                }
            });
        });

        // 로드맵 좌상단 "기이수 교과목 입력" → 온보딩 3/3 입력을 모달로 재사용
        const btnHistory = document.getElementById('btn-open-history');
        if (btnHistory) btnHistory.addEventListener('click', () => {
            if (window.KW_ONBOARDING && typeof window.KW_ONBOARDING.openHistory === 'function') {
                window.KW_ONBOARDING.openHistory();
            }
        });

        // 프리셋 로드: 반도체 대기업 합격 선배Presest
        document.getElementById('preset-sem-senior').addEventListener('click', () => {
            const preset = ["AMTH1009", "APHY1002", "APHY1003", "EE201", "EE202", "EE203", "EE207", "EE321", "EE328", "EE206", "EE365", "EE422", "EE497"];
            loadPreset(preset, "semiconductor");
        });

        // 프리셋 로드: 자율주행 선배 Preset
        document.getElementById('preset-ai-senior').addEventListener('click', () => {
            const preset = ["AMTH1009", "AMTH1004", "SWCON104", "EE213", "EE210", "EE209", "EE211", "EE342", "EE364", "EE371", "EE497"];
            loadPreset(preset, "ai");
        });

        // 프리셋 리셋
        document.getElementById('preset-reset').addEventListener('click', () => {
            completedCourses.clear();
            courseGrades = {};          // 성적도 함께 초기화
            saveCourseGrades();
            document.querySelectorAll('.course-checkbox-item input[type="checkbox"]').forEach(chk => {
                chk.checked = false;
                chk.closest('.course-checkbox-item').classList.remove('checked');
            });
            saveCompletedCourses();
            validateDependencies();
            updateTrackActiveCourses();
            updateRadarChart();
            renderMajorGpa();
            renderGpaModalList();
        });

        // 윈도우 리사이즈 시 SVG 연결선 다시 그리기
        window.addEventListener('resize', drawConnections);

        // 내 빌드 공유: 현재 이수 현황을 텍스트로 요약해 클립보드에 복사(백엔드 없이 간단 구현)
        const btnShareBuild = document.getElementById('btn-share-build');
        if (btnShareBuild) {
            btnShareBuild.addEventListener('click', () => {
                const profile = window.USER_PROFILE;
                const deptName = (window.DEPARTMENTS || []).find(d => d.code === (profile && profile.dept));
                const totalCredits = Array.from(completedCourses).reduce((sum, code) => {
                    const c = courses.find(item => item.code === code);
                    return sum + (c ? c.credits : 0);
                }, 0);
                const gradReq = window.GRAD_REQ || 130;
                const doneNames = Array.from(completedCourses)
                    .map(code => { const c = courses.find(item => item.code === code); return c ? c.name : null; })
                    .filter(Boolean);

                const lines = [
                    `[KHU-Weaver 내 빌드]`,
                    `${(deptName && deptName.name) || '전자공학과'} · ${(profile && profile.year) || ''}학번`,
                    `졸업 이수율: ${totalCredits}/${gradReq}학점`,
                    doneNames.length ? `이수 과목(${doneNames.length}개): ${doneNames.join(', ')}` : '아직 체크한 이수 과목이 없습니다.'
                ];
                const shareText = lines.join('\n');

                const done = () => alert('✅ 내 빌드 요약이 클립보드에 복사되었습니다.\n원하는 곳에 붙여넣어 공유하세요.');
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(shareText).then(done).catch(() => {
                        window.prompt('아래 내용을 복사하세요:', shareText);
                    });
                } else {
                    window.prompt('아래 내용을 복사하세요:', shareText);
                }
            });
        }
    }

    // 프리셋 일괄 수강 세팅 로직
    function loadPreset(presetCodes, trackName) {
        completedCourses.clear();
        
        // 체크박스 일체 제어
        document.querySelectorAll('.course-checkbox-item input[type="checkbox"]').forEach(chk => {
            const code = chk.value;
            const item = chk.closest('.course-checkbox-item');
            
            if (presetCodes.includes(code)) {
                chk.checked = true;
                completedCourses.add(code);
                if (item) item.classList.add('checked');
            } else {
                chk.checked = false;
                if (item) item.classList.remove('checked');
            }
        });

        currentTrack = trackName;
        saveCompletedCourses();
        validateDependencies();
        updateTrackActiveCourses();
        updateRadarChart();
        renderMajorGpa();
        renderGpaModalList();
    }



    /* =========================================================================
 * 전공 평점 (Major GPA) — 성적은 학기가 아니라 '과목'에 귀속.
 *   전공 평점 = Σ(성적점수 × 학점) / Σ학점   (성적 미입력·P/NP 과목은 제외)
 *   전체 평점·교양은 인포21 영역이므로 다루지 않는다.
 * ========================================================================= */
const GRADE_POINTS = { "A+":4.3, "A0":4.0, "A-":3.7, "B+":3.3, "B0":3.0, "B-":2.7, "C+":2.3, "C0":2.0, "C-":1.7, "D+":1.3, "D0":1.0, "F":0.0, "P":null, "NP":null };
const GRADE_ORDER = ["", "A+", "A0", "A-", "B+", "B0", "B-", "C+", "C0", "C-", "D+", "D0", "F", "P", "NP"];
const GRADES_STORAGE_KEY = 'khu-weaver-grades';

// 과목 귀속 성적 상태: { 과목코드: 성적문자열 }
let courseGrades = {};

function loadCourseGrades() {
    try { const raw = localStorage.getItem(GRADES_STORAGE_KEY); if (raw) courseGrades = JSON.parse(raw) || {}; }
    catch (e) { courseGrades = {}; }
}
function saveCourseGrades() {
    try { localStorage.setItem(GRADES_STORAGE_KEY, JSON.stringify(courseGrades)); } catch (e) {}
}

// 구(舊) 학기기반 성적 데이터가 저장돼 있으면 과목 귀속 구조로 1회 변환.
// 과목명 매칭 실패분은 폐기하고 콘솔 경고만 남긴다.
function migrateLegacyGpa() {
    let legacyRaw = null;
    try { legacyRaw = localStorage.getItem('khu-weaver-gpa') || localStorage.getItem('khu-weaver-semester-gpa'); } catch (e) {}
    if (!legacyRaw) return;
    let migrated = 0, discarded = 0;
    try {
        const legacy = JSON.parse(legacyRaw);
        const rows = [];
        if (Array.isArray(legacy)) rows.push(...legacy);
        else Object.keys(legacy || {}).forEach(k => { if (Array.isArray(legacy[k])) rows.push(...legacy[k]); });
        rows.forEach(r => {
            const nm = ((r && (r.name || r.courseName)) || '').replace(/\s/g, '');
            const g = r && (r.grade || r.g);
            const c = nm ? courses.find(x => x.name.replace(/\s/g, '') === nm) : null;
            if (c && g && Object.prototype.hasOwnProperty.call(GRADE_POINTS, g)) { courseGrades[c.code] = g; migrated++; }
            else discarded++;
        });
    } catch (e) { console.warn('[전공평점 마이그레이션] 파싱 실패로 건너뜀', e); }
    try { localStorage.removeItem('khu-weaver-gpa'); localStorage.removeItem('khu-weaver-semester-gpa'); } catch (e) {}
    if (migrated || discarded) console.warn(`[전공평점 마이그레이션] 변환 ${migrated}건 · 매칭 실패 폐기 ${discarded}건`);
    saveCourseGrades();
}

// 전공 평점 계산: 이수 체크 + 성적 입력(P/NP 제외) 과목만 반영
function computeMajorGpa() {
    let points = 0, gpaCredits = 0, gradedCount = 0;
    completedCourses.forEach(code => {
        const g = courseGrades[code];
        if (!g) return;                              // 성적 미입력 → 제외
        const p = GRADE_POINTS[g];
        if (p === null || p === undefined) return;   // P/NP → 제외
        const c = courses.find(x => x.code === code);
        if (!c) return;
        points += p * c.credits;
        gpaCredits += c.credits;
        gradedCount += 1;
    });
    return { gpa: gpaCredits > 0 ? points / gpaCredits : 0, gpaCredits: gpaCredits, gradedCount: gradedCount };
}

// 성적 드롭다운 옵션 HTML (미입력 포함)
function gradeOptionsHtml(selected) {
    const sel = selected || "";
    return GRADE_ORDER.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${k === "" ? '미입력' : k}</option>`).join('');
}

// 사이드바 KPI + 모달 요약 수치 갱신
function renderMajorGpa() {
    const r = computeMajorGpa();
    const gpaStr = r.gpaCredits > 0 ? r.gpa.toFixed(2) : "0.00";
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('stat-major-gpa', gpaStr);
    set('stat-major-graded', r.gradedCount);
    set('gpa-major-val', gpaStr);
    set('gpa-major-count', r.gradedCount);
    set('gpa-major-credits', r.gpaCredits);
}

// 같은 과목의 모든 성적 셀렉트(이수목록·모달) 값 동기화
function syncGradeSelects(code, grade) {
    document.querySelectorAll(`select[data-grade-code="${code}"]`).forEach(sel => { sel.value = grade || ""; });
}

// 성적 설정 진입점 (이수목록/모달 어디서 바꿔도 동일 처리)
function setCourseGrade(code, grade) {
    if (grade) courseGrades[code] = grade; else delete courseGrades[code];
    saveCourseGrades();
    syncGradeSelects(code, grade);
    renderMajorGpa();
    renderGpaModalList(); // 모달이 열려있으면 반영 뱃지 등 갱신
}

// 모달: 이수 체크된 전공 과목 목록(학년→학기 순) + 과목별 성적 셀렉트
function renderGpaModalList() {
    const box = document.getElementById('gpa-course-list');
    if (!box) return;
    const done = courses.filter(c => completedCourses.has(c.code));
    if (done.length === 0) {
        box.innerHTML = `<div class="gpa-empty">아직 이수 체크한 전공 과목이 없어요.<br>왼쪽 "기이수 교과목 입력"에서 들은 과목을 먼저 체크하세요.</div>`;
        return;
    }
    done.sort((a, b) => (a.year - b.year) || (a.sem - b.sem) || a.name.localeCompare(b.name));
    let html = '', lastYear = 0;
    done.forEach(c => {
        if (c.year !== lastYear) { lastYear = c.year; html += `<div class="gpa-cl-year">${c.year}학년</div>`; }
        const g = courseGrades[c.code] || "";
        const isGraded = g && GRADE_POINTS[g] !== null && GRADE_POINTS[g] !== undefined;
        const typeCls = c.type === "전공 필수" ? "ess" : (c.type === "전공 기초" ? "bas" : "sel");
        html += `
            <div class="gpa-cl-row${isGraded ? ' graded' : ''}">
                <span class="gpa-cl-nm">${c.name}</span>
                <span class="gpa-cl-badge ${typeCls}">${c.credits}학점</span>
                <select class="gpa-cl-grade" data-grade-code="${c.code}">${gradeOptionsHtml(g)}</select>
            </div>`;
    });
    box.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    const gpaOverlay = document.getElementById('gpa-overlay');

    function openGpaModal() {
        renderGpaModalList();
        renderMajorGpa();
        if (gpaOverlay) gpaOverlay.classList.add('visible');
    }
    function closeGpaModal() { if (gpaOverlay) gpaOverlay.classList.remove('visible'); }

    const btnOpenGpa = document.getElementById('btn-open-gpa');
    if (btnOpenGpa) btnOpenGpa.addEventListener('click', openGpaModal);
    const btnOpenGpaHeader = document.getElementById('btn-open-gpa-header');
    if (btnOpenGpaHeader) btnOpenGpaHeader.addEventListener('click', openGpaModal);
    const btnCloseGpa = document.getElementById('btn-close-gpa');
    if (btnCloseGpa) btnCloseGpa.addEventListener('click', closeGpaModal);
    const btnGpaDone = document.getElementById('btn-gpa-done');
    if (btnGpaDone) btnGpaDone.addEventListener('click', closeGpaModal);
    // 오버레이 바깥 클릭 시 닫기
    if (gpaOverlay) gpaOverlay.addEventListener('click', e => { if (e.target === gpaOverlay) closeGpaModal(); });

    // 모달 안 성적 셀렉트 변경(이벤트 위임)
    const listBox = document.getElementById('gpa-course-list');
    if (listBox) listBox.addEventListener('change', e => {
        if (e.target && e.target.classList && e.target.classList.contains('gpa-cl-grade')) {
            setCourseGrade(e.target.dataset.gradeCode, e.target.value);
        }
    });
});
