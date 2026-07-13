/* =============================================================================
 * ocr.js — 에타/인포21 성적 스크린샷 → Gemini OCR → 전공 과목 자동 입력 (U-2)
 *
 *  - 키는 config.js(window.KW_CONFIG.GEMINI_API_KEY)에서만 읽는다(복사 금지).
 *  - 온보딩 3/3 "A. 스크린샷" 진입 시 KW_OCR.enter(opts)로 시작.
 *  - 매칭은 '현재 프로필 학번의 CURRICULA 전공 과목'만 대상(①학수번호 ②과목명 정규화).
 *    미매칭 항목은 노랑 표시 + 수동 매칭 드롭다운(기본 '전공 외·제외').
 *  - 성적은 과목 귀속 구조(코드→성적)로 onApply(gradeMap) 콜백을 통해 넘긴다.
 *    (app.js 계산 로직은 건드리지 않고 데이터만 주입)
 *  - 원본 이미지는 어디에도 저장하지 않는다(메모리에서만 base64 인코딩).
 * ============================================================================= */
window.KW_OCR = (function () {
    "use strict";

    var GRADE_KEYS = ["A+", "A0", "A-", "B+", "B0", "B-", "C+", "C0", "C-", "D+", "D0", "F", "P", "NP"];
    var PHRASES = ["성적표를 읽는 중…", "과목을 대조하는 중…", "성적을 엮는 중…", "빌드를 짜는 중…"];
    var BATCH_SIZE = 8;
    var LONG_EDGE = 2048;
    var JPEG_QUALITY_DEFAULT = 0.85;
    var JPEG_QUALITY_FALLBACK = 0.8;
    var MAX_REQUEST_BYTES = 20 * 1024 * 1024; // Gemini 요청 1회 총 용량 상한(대략치)
    var PER_FILE_BUDGET = Math.floor(MAX_REQUEST_BYTES / BATCH_SIZE); // 8장 배치 기준 1장당 예산

    var opts = null;      // { getProfile, onApply, onBack, onFallbackB }
    var files = [];       // [{ name, dataUrl, base64, mime }]
    var curriculum = [];  // 현재 프로필의 전공 과목 목록
    var phraseTimer = null, progTimer = null;
    var guideTimer = null, guideTimeouts = [], guideIdx = 0; // 캡쳐 안내 애니메이션(U-2 업그레이드)

    // ---- 설정 --------------------------------------------------------------
    function cfg() { return window.KW_CONFIG || {}; }
    function apiKey() { return (cfg().GEMINI_API_KEY || "").trim(); }
    function apiEndpoint() { return (cfg().OCR_API_ENDPOINT || "/api/ocr").trim(); }
    function modelName() { return cfg().GEMINI_MODEL || "gemini-2.5-flash"; }
    function maxFiles() { return Math.max(BATCH_SIZE, parseInt(cfg().OCR_MAX_FILES || 20, 10) || 20); }
    function isEnabled() { return apiKey().length > 0 || apiEndpoint().length > 0; }

    function fallbackModels() {
        var raw = cfg().GEMINI_FALLBACK_MODELS || [];
        if (typeof raw === "string") raw = raw.split(",");
        if (!Array.isArray(raw)) raw = [];
        var seen = {};
        return [modelName()].concat(raw).map(function (m) { return String(m || "").trim(); })
            .filter(function (m) {
                if (!m || seen[m]) return false;
                seen[m] = true;
                return true;
            }).slice(0, 2);
    }

    function root() { return document.getElementById("ob-ocr-root"); }
    function norm(s) { return (s == null ? "" : String(s)).replace(/[\s()\[\]{}·.,/\\\-_:;'"]+/g, "").toLowerCase(); }

    function getCurriculumCourses() {
        var p = opts && opts.getProfile ? opts.getProfile() : {};
        if (typeof window.getCurriculum === "function") {
            var cur = window.getCurriculum(p.dept, p.year) || {};
            return Array.isArray(cur.courses) ? cur.courses : [];
        }
        return [];
    }

    // ---- 성적 문자열 정규화 -------------------------------------------------
    function normGrade(g) {
        if (!g) return "";
        var s = String(g).trim().toUpperCase().replace(/\s/g, "");
        if (GRADE_KEYS.indexOf(s) >= 0) return s;
        if (/^[ABCD]$/.test(s)) return s + "0";      // 'A' → 'A0'
        if (s === "PASS") return "P";
        if (s === "NONPASS" || s === "N") return "NP";
        return "";                                    // 인식 불가 → 미입력
    }

    // ---- 자모 단위 유사도(오타·표기 흔들림 완화) ----------------------------
    // 한글 음절(가~힣)을 초성/중성/종성 자모로 분해, 그 외 문자(숫자·영문 등)는 그대로 둔다.
    var HANGUL_L = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
    var HANGUL_V = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
    var HANGUL_T = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

    function hangulToJamo(s) {
        var out = [];
        for (var i = 0; i < s.length; i++) {
            var code = s.charCodeAt(i);
            if (code >= 0xac00 && code <= 0xd7a3) {
                var off = code - 0xac00;
                var l = Math.floor(off / (21 * 28));
                var v = Math.floor((off % (21 * 28)) / 28);
                var t = off % 28;
                out.push(HANGUL_L[l], HANGUL_V[v]);
                if (HANGUL_T[t]) out.push(HANGUL_T[t]);
            } else {
                out.push(s.charAt(i));
            }
        }
        return out;
    }

    // 표준 편집거리(Levenshtein), maxDist 초과가 확실하면 조기 종료
    function editDistance(a, b, maxDist) {
        var m = a.length, n = b.length;
        if (Math.abs(m - n) > maxDist) return maxDist + 1;
        var prev = new Array(n + 1);
        for (var j = 0; j <= n; j++) prev[j] = j;
        for (var i = 1; i <= m; i++) {
            var cur = new Array(n + 1);
            cur[0] = i;
            var rowMin = cur[0];
            for (j = 1; j <= n; j++) {
                var cost = a[i - 1] === b[j - 1] ? 0 : 1;
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
                if (cur[j] < rowMin) rowMin = cur[j];
            }
            if (rowMin > maxDist) return maxDist + 1;
            prev = cur;
        }
        return prev[n];
    }

    // 문자열 끝의 연속 숫자(과목 학기 접미사 등, 예: '전자기학1')를 분리
    function splitTrailingDigits(s) {
        var m = /^(.*?)(\d+)$/.exec(s);
        return m ? { core: m[1], digits: m[2] } : { core: s, digits: "" };
    }

    // norm() 처리된(공백·특수문자 제거, 소문자화) 두 이름의 유사 여부.
    // 숫자 접미사가 다르면(예: '전자기학1' vs '전자기학2') 절대 유사 처리하지 않는다.
    function fuzzyNameMatch(normA, normB) {
        if (!normA || !normB || normA === normB) return false;
        var da = splitTrailingDigits(normA), db = splitTrailingDigits(normB);
        if (da.digits !== db.digits) return false;
        if (!da.core || !db.core) return false;
        return editDistance(hangulToJamo(da.core), hangulToJamo(db.core), 1) <= 1;
    }

    // ---- 매칭 (전공 과목만) -------------------------------------------------
    // items: [{name, code?, credits?, grade?}], courses: 커리큘럼 과목 배열
    function classify(items, courses) {
        courses = courses || curriculum;
        var byCode = {}, byName = {};
        courses.forEach(function (c) { byCode[String(c.code).toLowerCase()] = c; byName[norm(c.name)] = c; });
        return (items || []).map(function (it) {
            var code = (it.code || "").toString().trim();
            var nm = (it.name || "").toString().trim();
            var match = null, how = null;
            if (code && byCode[code.toLowerCase()]) { match = byCode[code.toLowerCase()]; how = "code"; }
            else if (nm && byName[norm(nm)]) { match = byName[norm(nm)]; how = "name"; }
            else if (nm) {
                var nmNorm = norm(nm);
                for (var i = 0; i < courses.length; i++) {
                    if (fuzzyNameMatch(nmNorm, norm(courses[i].name))) { match = courses[i]; how = "fuzzy"; break; }
                }
            }
            return { name: nm, code: code, credits: it.credits, grade: normGrade(it.grade), match: match, how: how };
        });
    }

    // ---- Gemini 응답 파싱 ---------------------------------------------------
    function parseGemini(json) {
        var text = "";
        try {
            var parts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
            if (Array.isArray(parts)) text = parts.map(function (p) { return p.text || ""; }).join("");
        } catch (e) {}
        if (!text) throw new Error("응답이 비어 있어요");
        var data = JSON.parse(text); // responseMimeType=json 이라 순수 JSON
        if (!Array.isArray(data)) {
            if (data && Array.isArray(data.courses)) data = data.courses;
            else throw new Error("형식이 올바르지 않아요");
        }
        if (data.length === 0) throw new Error("과목을 하나도 찾지 못했어요");
        return data;
    }

    function ocrGenerationConfig() {
        return {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING" },
                        code: { type: "STRING" },
                        credits: { type: "NUMBER" },
                        grade: { type: "STRING" },
                        semester: { type: "STRING" }
                    },
                    required: ["name"]
                }
            }
        };
    }

    function buildPrompt() {
        var lines = [
            "다음 이미지는 경희대학교 에브리타임 학점계산기 또는 인포21 성적조회 화면의 수강·성적 스크린샷이다.",
            "표에 보이는 각 과목에 대해 아래 필드를 추출해 JSON 배열로만 응답하라. 설명이나 마크다운 없이 JSON만 출력한다.",
            "필드: name(과목명, 필수), code(학수번호, 있으면), credits(학점 숫자), grade(성적 문자: A+/A0/A-/B+/B0/B-/C+/C0/C-/D+/D0/F/P/NP 중 하나, 있으면), semester(수강학기, 있으면).",
            '출력 예시: [{"name":"회로이론","code":"EE202","credits":3,"grade":"A0","semester":"2-1"},{"name":"미분적분학","code":"AMTH1009","credits":3,"grade":"B+"}]',
            "값이 없으면 해당 키를 생략한다. 성적이 보이지 않으면 grade를 생략한다.",
            "과목명, 학수번호, 학점, 등급이 보이는 행만 추출하고 표 머리글·평점평균·총평점·석차 같은 요약 행은 제외한다."
        ];
        if (curriculum && curriculum.length) {
            var list = curriculum.map(function (c) { return c.code + " " + c.name; }).join(", ");
            lines.push(
                "다음은 이 학생 학번의 정식 전공 교육과정 과목 목록(학수번호 과목명)이다: " + list + ".",
                "표의 과목이 이 목록의 과목과 사실상 같다면(오타·띄어쓰기·유사 표기 포함, 예: '전자기학1'/'전자기학Ⅰ', '파이썬'/'파이선') 반드시 목록에 있는 정식 name과 code로 응답하라.",
                "목록에 없는 과목(교양 등)은 원문 그대로 name만 쓰고 code는 생략한다."
            );
        }
        return lines.join("\n");
    }

    function callGeminiBatch(batchFiles) {
        var parts = [{ text: buildPrompt() }];
        batchFiles.forEach(function (f) { parts.push({ inline_data: { mime_type: f.mime, data: f.base64 } }); });
        var body = { contents: [{ parts: parts }], generationConfig: ocrGenerationConfig() };
        var key = apiKey();
        if (key) {
            return callGeminiDirectWithFallback(body);
        }
        body.model = modelName();
        return fetchGemini(apiEndpoint(), body);
    }

    function callGeminiDirectWithFallback(body) {
        var models = fallbackModels();
        function run(i, lastErr) {
            if (i >= models.length) return Promise.reject(lastErr || new Error("Gemini 요청에 실패했어요"));
            var url = "https://generativelanguage.googleapis.com/v1beta/models/" + models[i] +
                ":generateContent?key=" + encodeURIComponent(apiKey());
            return fetchGemini(url, body).catch(function (err) {
                if (i < models.length - 1 && isRetryableOcrError(err)) return run(i + 1, err);
                throw err;
            });
        }
        return run(0);
    }

    function fetchGemini(url, body) {
        return fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }).then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return {}; }).then(function (payload) {
                    var err = new Error(errorMessageForStatus(r.status, payload));
                    err.status = r.status;
                    throw err;
                });
            }
            return r.json();
        }).then(parseGemini);
    }

    function errorMessageForStatus(status, payload) {
        if (status === 404) return "선택한 분석 모델을 사용할 수 없어요. 보조 모델로 다시 시도합니다.";
        if (status === 429) return "오늘 분석 사용량이 잠시 가득 찼어요. 잠시 후 다시 시도하거나 직접 선택으로 이어가세요.";
        if (status >= 500) return "분석 서버가 잠시 불안정해요. 다시 시도하거나 직접 선택으로 이어가세요.";
        return (payload && payload.error) || ("서버 응답 오류 (HTTP " + status + ")");
    }

    function isRetryableOcrError(err) {
        return err && (err.status === 404 || err.status === 429 || err.status >= 500 || /응답이 비어|형식이 올바르지|JSON|과목을 하나도/.test(err.message || ""));
    }

    function callGemini() {
        var batches = chunk(files, BATCH_SIZE);
        var all = [];
        var chain = Promise.resolve();
        batches.forEach(function (batch, i) {
            chain = chain.then(function () {
                updateProgress(i, batches.length);
                return callGeminiBatch(batch).then(function (items) {
                    all = all.concat(items || []);
                    updateProgress(i + 1, batches.length);
                });
            });
        });
        return chain.then(function () { return dedupeItems(all); });
    }

    function chunk(arr, size) {
        var out = [];
        for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    function dedupeItems(items) {
        var seen = {};
        return (items || []).filter(function (it) {
            var key = (it.code ? "c:" + String(it.code).toLowerCase() : "n:" + norm(it.name)) + ":" + normGrade(it.grade || "");
            if (!key || seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    // ---- 이미지 리사이즈 → base64 (긴 변 2048px, jpeg 0.85 · 용량 초과 시 0.8) --
    function estimateBase64Bytes(base64) { return Math.ceil((base64.length * 3) / 4); }

    function resizeToBase64(file, cb) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
            var scale = Math.min(1, LONG_EDGE / Math.max(img.width, img.height));
            var cw = Math.max(1, Math.round(img.width * scale));
            var ch = Math.max(1, Math.round(img.height * scale));
            var canvas = document.createElement("canvas");
            canvas.width = cw; canvas.height = ch;
            canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
            URL.revokeObjectURL(url);
            var dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY_DEFAULT);
            var base64 = dataUrl.split(",")[1] || "";
            // 8장×2048px 기준 총 20MB 예산(1장당 대략치) 초과 시 품질을 낮춰 재인코딩
            if (estimateBase64Bytes(base64) > PER_FILE_BUDGET) {
                dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY_FALLBACK);
                base64 = dataUrl.split(",")[1] || "";
            }
            cb({ dataUrl: dataUrl, base64: base64, mime: "image/jpeg" });
        };
        img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
        img.src = url;
    }

    // =====================================================================
    // UI: 업로드
    // =====================================================================
    function enter(o) {
        opts = o || {};
        files = [];
        curriculum = getCurriculumCourses();
        var el = root();
        if (!el) return;
        el.style.display = "";
        renderUpload();
    }

    function renderUpload() {
        stopTimers();
        root().innerHTML =
            '<div class="ocr-head"><div class="ocr-title">📷 에타/인포21 성적 스크린샷</div>' +
            '<div class="ocr-sub">둘 중 하나만 올려도 됩니다. 과목명·학점·등급이 보이는 캡쳐를 최대 ' + maxFiles() + '장까지 넣어주세요.</div></div>' +
            '<button class="ocr-guide-btn" id="ocr-guide-open" type="button">어떤 사진을 올리나요?</button>' +
            '<label class="ocr-drop" id="ocr-drop">' +
                '<input type="file" id="ocr-file" accept="image/png,image/jpeg" multiple hidden>' +
                '<div class="ocr-drop-ic">🧵</div>' +
                '<div class="ocr-drop-t">여기로 드래그하거나 클릭해서 선택</div>' +
                '<div class="ocr-drop-d">JPG · PNG · 최대 ' + maxFiles() + '장 · 서버에는 8장씩 나눠 분석</div>' +
            '</label>' +
            '<div class="ocr-msg" id="ocr-msg"></div>' +
            '<div class="ocr-thumbs" id="ocr-thumbs"></div>' +
            '<p class="ocr-privacy">🔒 사진은 분석에만 쓰이고 저장되지 않아요. 이름·학번은 가리고 찍어도 됩니다.</p>' +
            '<div class="onboarding-nav">' +
                '<button class="onboarding-back-btn" id="ocr-back" type="button">← 방법 선택</button>' +
                '<div class="onboarding-nav-spacer"></div>' +
                '<button class="onboarding-submit onboarding-nav-btn" id="ocr-analyze" type="button" disabled>분석 시작</button>' +
            '</div>';

        var input = document.getElementById("ocr-file");
        var drop = document.getElementById("ocr-drop");
        input.addEventListener("change", function () { addFiles(input.files); input.value = ""; });
        ["dragenter", "dragover"].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
        });
        drop.addEventListener("drop", function (e) {
            if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
        });
        document.getElementById("ocr-back").addEventListener("click", function () { if (opts.onBack) opts.onBack(); });
        document.getElementById("ocr-analyze").addEventListener("click", startAnalyze);
        document.getElementById("ocr-guide-open").addEventListener("click", function () { openCaptureGuide("eta"); });
        renderThumbs();
    }

    function msg(t) { var m = document.getElementById("ocr-msg"); if (m) m.textContent = t || ""; }

    function addFiles(fileList) {
        var arr = Array.prototype.slice.call(fileList || []).filter(function (f) { return /image\/(png|jpe?g)/.test(f.type); });
        var room = maxFiles() - files.length;
        if (arr.length > room) { msg("최대 " + maxFiles() + "장까지만 올릴 수 있어요. " + Math.max(0, room) + "장만 추가했어요."); arr = arr.slice(0, Math.max(0, room)); }
        else msg("");
        var pending = arr.length;
        if (!pending) return;
        arr.forEach(function (f) {
            resizeToBase64(f, function (res) {
                if (res && res.base64) files.push({ name: f.name, dataUrl: res.dataUrl, base64: res.base64, mime: res.mime });
                if (--pending === 0) renderThumbs();
            });
        });
    }

    function renderThumbs() {
        var box = document.getElementById("ocr-thumbs");
        if (box) {
            box.innerHTML = files.map(function (f, i) {
                return '<div class="ocr-thumb"><img src="' + f.dataUrl + '" alt="">' +
                       '<button class="ocr-thumb-x" data-i="' + i + '" type="button" aria-label="삭제">✕</button></div>';
            }).join("");
            box.querySelectorAll(".ocr-thumb-x").forEach(function (b) {
                b.addEventListener("click", function () { files.splice(parseInt(b.dataset.i, 10), 1); renderThumbs(); });
            });
        }
        var analyze = document.getElementById("ocr-analyze");
        if (analyze) {
            analyze.disabled = files.length === 0;
            analyze.textContent = files.length ? (files.length + "장 분석 시작") : "분석 시작";
        }
    }

    function openCaptureGuide(tab) {
        closeCaptureGuide();
        var guide = document.createElement("div");
        guide.className = "ocr-guide-modal";
        guide.id = "ocr-guide-modal";
        guide.innerHTML =
            '<div class="ocr-guide-card" role="dialog" aria-modal="true" aria-label="스크린샷 안내">' +
                '<div class="ocr-guide-top">' +
                    '<div><div class="ocr-guide-title">어떤 화면을 캡쳐하면 되나요?</div>' +
                    '<div class="ocr-guide-sub">에타 또는 인포21 중 하나만 준비하면 됩니다.</div></div>' +
                    '<button class="ocr-guide-close" id="ocr-guide-close" type="button" aria-label="닫기">✕</button>' +
                '</div>' +
                '<div class="ocr-guide-tabs">' +
                    '<button class="ocr-guide-tab" data-guide="eta" type="button">에타</button>' +
                    '<button class="ocr-guide-tab" data-guide="info21" type="button">인포21</button>' +
                '</div>' +
                '<div id="ocr-guide-body"></div>' +
            '</div>';
        document.body.appendChild(guide);
        guide.addEventListener("click", function (e) { if (e.target === guide) closeCaptureGuide(); });
        document.getElementById("ocr-guide-close").addEventListener("click", closeCaptureGuide);
        guide.querySelectorAll(".ocr-guide-tab").forEach(function (b) {
            b.addEventListener("click", function () { renderCaptureGuide(b.dataset.guide); });
        });
        renderCaptureGuide(tab || "eta");
    }

    function closeCaptureGuide() {
        stopGuideLoop();
        var old = document.getElementById("ocr-guide-modal");
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    function renderCaptureGuide(kind) {
        var modal = document.getElementById("ocr-guide-modal");
        var body = document.getElementById("ocr-guide-body");
        if (!modal || !body) return;
        modal.querySelectorAll(".ocr-guide-tab").forEach(function (b) {
            b.classList.toggle("active", b.dataset.guide === kind);
        });
        stopGuideLoop();
        body.innerHTML = '<div class="ocr-guide-stage">' + (kind === "info21" ? ogInfo21Stage() : ogEtaStage()) + '</div>';
        startGuideLoop(kind);
    }

    // =====================================================================
    // UI: 캡쳐 안내 애니메이션 — 실제 화면 캡쳐본 기준 재현(개인정보는 가림/대체)
    //  - 에타: 다크 테마 폰 목업. 시간표 탭 → 설정 → 이미지로 저장(크롭 불필요)
    //  - 인포21: 데스크톱 브라우저 목업. 수업/성적 → 수강신청내역 → 표 캡쳐(크롭+플래시)
    // =====================================================================
    function ogEtaStage() {
        return (
            '<div class="og-wrap">' +
                '<div class="og-phone"><div class="og-screen dark" id="og-screen">' +
                    '<div class="mock-phone-bar">9:41 <span>100%</span></div>' +
                    '<div class="og-body og-eta-body">' +
                        '<div class="og-eta-home" id="og-home">' +
                            '<div class="og-eta-topicons"><span>🔍</span><span>🔔</span><span>👤</span></div>' +
                            '<div class="og-eta-h1">경희대</div>' +
                            '<div class="og-eta-banners"><span></span><span></span></div>' +
                            '<div class="og-eta-shortcuts"><span></span><span></span><span></span><span></span><span></span></div>' +
                        '</div>' +
                        '<div class="og-eta-tl" id="og-tl">' +
                            '<div class="og-tl-head">' +
                                '<div><div class="og-tl-sub">2026년 1학기</div><div class="og-tl-title">내 시간표</div></div>' +
                                '<div class="og-tl-ic" id="og-gear">⚙</div>' +
                            '</div>' +
                            '<div class="og-tl-grid">' +
                                '<span class="og-day">월</span><span class="og-day">화</span><span class="og-day">수</span><span class="og-day">목</span><span class="og-day">금</span><span class="og-day">토</span>' +
                                '<span class="og-c" style="grid-column:1;grid-row:2/4;background:hsl(6,45%,42%)">전자기학</span>' +
                                '<span class="og-c" style="grid-column:3;grid-row:2/4;background:hsl(6,45%,42%)">전자기학</span>' +
                                '<span class="og-c" style="grid-column:2;grid-row:3/5;background:hsl(28,55%,42%)">신호와시스템</span>' +
                                '<span class="og-c" style="grid-column:4;grid-row:3/5;background:hsl(28,55%,42%)">신호와시스템</span>' +
                                '<span class="og-c" style="grid-column:1;grid-row:5/6;background:hsl(43,45%,40%)">논리회로</span>' +
                                '<span class="og-c" style="grid-column:3;grid-row:5/6;background:hsl(43,45%,40%)">논리회로</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="og-tabbar dark">' +
                        '<div class="og-tab">홈</div><div class="og-tab" id="og-tab-tl">시간표</div>' +
                        '<div class="og-tab">게시판</div><div class="og-tab">채팅</div><div class="og-tab">혜택</div>' +
                    '</div>' +
                    '<div class="og-arrow" id="og-arrow">▲</div>' +
                    '<div class="og-sheet" id="og-sheet">' +
                        '<div class="og-sheet-row">✏️&nbsp; 이름 변경</div>' +
                        '<div class="og-sheet-row">🔒&nbsp; 공개 범위 변경</div>' +
                        '<div class="og-sheet-row">🎨&nbsp; 테마 및 스타일 변경</div>' +
                        '<div class="og-sheet-row" id="og-save-row">⬇️&nbsp; 이미지로 저장</div>' +
                        '<div class="og-sheet-row">🔗&nbsp; URL 복사</div>' +
                        '<div class="og-sheet-row">📤&nbsp; 시간표 링크 공유</div>' +
                        '<div class="og-sheet-row">🗑️&nbsp; 삭제</div>' +
                    '</div>' +
                    '<div class="og-done" id="og-done">' +
                        '<div class="og-done-check">✓</div>' +
                        '<div class="og-done-t">이미지 저장 완료</div>' +
                        '<div class="og-done-d">사진 앱에 저장된 시간표를 그대로 업로드하면 돼요</div>' +
                    '</div>' +
                    '<div class="og-finger" id="og-finger"></div>' +
                '</div></div>' +
                ogSteps([
                    ["에타 앱 → 하단 <span class=\"og-key\">시간표</span> 탭", "홈 화면 아래쪽 탭바에서 시간표를 눌러요."],
                    ["오른쪽 위 <span class=\"og-key\">⚙ 설정</span> 아이콘", "시간표 화면 상단의 톱니바퀴 아이콘을 누릅니다."],
                    ["<span class=\"og-key\">이미지로 저장</span> 선택", "아래에서 올라오는 메뉴에서 이미지로 저장을 누르세요."],
                    ["저장된 이미지를 업로드", "사진 앱에 저장된 시간표 이미지를 그대로 올리면 끝!"]
                ]) +
            '</div>'
        );
    }

    function ogInfo21Stage() {
        return (
            '<div class="og-browser-wrap">' +
                '<div class="og-browser">' +
                    '<div class="og-browser-bar"><span class="og-dot"></span><span class="og-dot"></span><span class="og-dot"></span><span class="og-browser-url">🔒 portal.khu.ac.kr</span></div>' +
                    '<div class="og-screen wide" id="og-screen">' +
                        '<div class="og-portal-top">' +
                            '<span class="og-portal-logo">경희대학교 포털</span>' +
                            '<span class="og-portal-user"><span class="og-blur-av">🙈</span><span class="og-blur-name">◼◼◼님 (가림)</span></span>' +
                        '</div>' +
                        '<div class="og-portal-nav">' +
                            '<span>학적</span><span id="og-entry">수업/성적</span><span>등록/장학</span><span>대학생활</span><span>커뮤니티</span>' +
                        '</div>' +
                        '<div class="og-portal-body" id="og-portal-body">' +
                            '<div class="og-ph-card"></div><div class="og-ph-card"></div><div class="og-ph-card"></div>' +
                        '</div>' +
                        '<div class="og-menu og-menu-portal" id="og-menu">' +
                            '<div class="og-menu-col"><b>수업</b><div class="og-menu-row">교육과정조회</div><div class="og-menu-row">종합강의시간표</div></div>' +
                            '<div class="og-menu-col"><b>수강</b><div class="og-menu-row" id="og-menu-item">수강신청내역</div><div class="og-menu-row">수강희망과목신청내역</div></div>' +
                            '<div class="og-menu-col"><b>성적</b><div class="og-menu-row">금학기성적조회</div><div class="og-menu-row">전체성적조회</div></div>' +
                        '</div>' +
                        '<div class="og-portal-table" id="og-target">' +
                            '<div class="og-pt-title">수강신청내역</div>' +
                            '<div class="mock-row head"><span>이수구분</span><span>교과목명</span><span>학점</span><span>담당교수</span></div>' +
                            '<div class="mock-row"><span>전공필수</span><span>전자기학</span><span>3</span><span>홍길동</span></div>' +
                            '<div class="mock-row"><span>전공필수</span><span>회로이론</span><span>3</span><span>김철수</span></div>' +
                            '<div class="mock-row"><span>전공필수</span><span>논리회로</span><span>3</span><span>이영희</span></div>' +
                            '<div class="mock-row"><span>전공기초</span><span>객체지향프로그래밍및실습</span><span>3</span><span>박민수</span></div>' +
                        '</div>' +
                        '<div class="ocr-crop-box" id="og-crop"></div>' +
                        '<div class="og-flash" id="og-flash"></div>' +
                        '<div class="og-done" id="og-done">' +
                            '<div class="og-done-check">✓</div>' +
                            '<div class="og-done-t">캡쳐 완료</div>' +
                            '<div class="og-done-d">과목이 다 보이게 캡쳐했다면 완료!</div>' +
                        '</div>' +
                        '<div class="og-finger" id="og-finger"></div>' +
                    '</div>' +
                '</div>' +
                ogSteps([
                    ["인포21 로그인 → <span class=\"og-key\">수업/성적</span> 클릭", "상단 메뉴에서 수업/성적을 눌러요. (내 사진·학번은 가리고 캡쳐하세요)"],
                    ["<span class=\"og-key\">수강신청내역</span> 클릭", "펼쳐진 메뉴 중 '수강' 칸의 수강신청내역을 누릅니다."],
                    ["학년도·학기 선택 → 표 캡쳐", "과목명·학점이 보이는 표 전체가 나오면 화면을 캡쳐하세요."],
                    ["과목이 다 보이게", "스크롤해서라도 과목 행이 전부 포함되게 캡쳐해주세요."]
                ], "grid2") +
            '</div>'
        );
    }

    function ogSteps(items, extraClass) {
        var html = '<div class="og-steps' + (extraClass ? " " + extraClass : "") + '" id="og-steps">';
        for (var i = 0; i < items.length; i++) {
            html += '<div class="og-step"><div class="og-num">' + (i + 1) + '</div><div><b>' + items[i][0] + '</b><p>' + items[i][1] + '</p></div></div>';
        }
        html += '<div class="og-done-tag" id="og-done-tag">✓ 이렇게 캡쳐한 사진을 그대로 올리면 끝이에요</div></div>';
        return html;
    }

    function ogStepsOn(idx, total) {
        var box = document.getElementById("og-steps");
        if (!box) return;
        var steps = box.querySelectorAll(".og-step");
        for (var i = 0; i < steps.length; i++) steps[i].classList.toggle("on", i === idx);
        var tag = document.getElementById("og-done-tag");
        if (tag) tag.classList.toggle("show", idx === total - 1);
    }

    function ogFingerAt(target) {
        var finger = document.getElementById("og-finger");
        var screen = document.getElementById("og-screen");
        if (!finger) return;
        if (!target || !screen) { finger.classList.remove("tap"); return; }
        var r = target.getBoundingClientRect(), s = screen.getBoundingClientRect();
        finger.style.left = (r.left - s.left + r.width / 2 - 14) + "px";
        finger.style.top = (r.top - s.top + r.height / 2 - 14) + "px";
        finger.classList.add("tap");
    }

    function ogArrowAt(target) {
        var arrow = document.getElementById("og-arrow");
        var screen = document.getElementById("og-screen");
        if (!arrow) return;
        if (!target || !screen) { arrow.classList.remove("show"); return; }
        var r = target.getBoundingClientRect(), s = screen.getBoundingClientRect();
        arrow.style.left = (r.left - s.left + r.width / 2 - 7) + "px";
        arrow.style.top = (r.top - s.top - 18) + "px";
        arrow.classList.add("show");
    }

    function ogCropAt(target) {
        var crop = document.getElementById("og-crop");
        var screen = document.getElementById("og-screen");
        if (!crop || !target || !screen) return;
        var r = target.getBoundingClientRect(), s = screen.getBoundingClientRect();
        crop.style.left = (r.left - s.left - 6) + "px";
        crop.style.top = (r.top - s.top - 6) + "px";
        crop.style.width = (r.width + 12) + "px";
        crop.style.height = (r.height + 12) + "px";
        crop.classList.add("show");
    }

    // ---- 에타: 홈 → 시간표 → 설정 시트 → 이미지로 저장(크롭 없음) --------------
    function ogEtaReset() {
        var home = document.getElementById("og-home");
        var tl = document.getElementById("og-tl");
        var tab = document.getElementById("og-tab-tl");
        var gear = document.getElementById("og-gear");
        var sheet = document.getElementById("og-sheet");
        var save = document.getElementById("og-save-row");
        var done = document.getElementById("og-done");
        if (home) home.style.display = "";
        if (tl) tl.style.display = "none";
        if (tab) tab.classList.remove("hot", "active");
        if (gear) gear.classList.remove("hot");
        if (sheet) sheet.classList.remove("open");
        if (save) save.classList.remove("hot");
        if (done) done.classList.remove("show");
        ogFingerAt(null);
        ogArrowAt(null);
    }
    function ogEtaShowTl() {
        var home = document.getElementById("og-home"), tl = document.getElementById("og-tl"), tab = document.getElementById("og-tab-tl");
        if (home) home.style.display = "none";
        if (tl) tl.style.display = "block";
        if (tab) tab.classList.add("active");
    }

    var OG_ETA_SCENES = [
        function () { // 1. 홈 화면 → 하단 시간표 탭
            ogEtaReset(); ogStepsOn(0, OG_ETA_SCENES.length);
            gDelay(function () {
                var tab = document.getElementById("og-tab-tl");
                if (tab) tab.classList.add("hot");
                ogFingerAt(tab);
                ogArrowAt(tab);
            }, 260);
        },
        function () { // 2. 시간표 화면 → 설정(⚙) 아이콘
            ogEtaReset(); ogStepsOn(1, OG_ETA_SCENES.length);
            ogEtaShowTl();
            gDelay(function () {
                var gear = document.getElementById("og-gear");
                if (gear) gear.classList.add("hot");
                ogFingerAt(gear);
            }, 320);
        },
        function () { // 3. 설정 시트 열림 → 이미지로 저장
            ogEtaReset(); ogStepsOn(2, OG_ETA_SCENES.length);
            ogEtaShowTl();
            var sheet = document.getElementById("og-sheet");
            if (sheet) sheet.classList.add("open");
            gDelay(function () {
                var save = document.getElementById("og-save-row");
                if (save) save.classList.add("hot");
                ogFingerAt(save);
            }, 420);
        },
        function () { // 4. 완료
            ogEtaReset(); ogStepsOn(3, OG_ETA_SCENES.length);
            ogEtaShowTl();
            var done = document.getElementById("og-done");
            if (done) done.classList.add("show");
        }
    ];

    // ---- 인포21: 상단메뉴 → 메가메뉴 → 수강신청내역 표 → 캡쳐(크롭+플래시) -----
    function ogInfo21Reset() {
        var menu = document.getElementById("og-menu");
        var entry = document.getElementById("og-entry");
        var item = document.getElementById("og-menu-item");
        var crop = document.getElementById("og-crop");
        var flash = document.getElementById("og-flash");
        var done = document.getElementById("og-done");
        var pbody = document.getElementById("og-portal-body");
        var table = document.getElementById("og-target");
        if (menu) menu.classList.remove("open");
        if (entry) entry.classList.remove("hot");
        if (item) item.classList.remove("hot");
        if (crop) crop.classList.remove("show");
        if (flash) flash.classList.remove("flash");
        if (done) done.classList.remove("show");
        if (pbody) pbody.style.display = "";
        if (table) table.style.display = "none";
        ogFingerAt(null);
    }
    function ogInfo21ShowTable() {
        var pbody = document.getElementById("og-portal-body");
        var table = document.getElementById("og-target");
        if (pbody) pbody.style.display = "none";
        if (table) table.style.display = "block";
    }

    var OG_INFO21_SCENES = [
        function () { // 1. 진입점(수업/성적) 탭
            ogInfo21Reset(); ogStepsOn(0, OG_INFO21_SCENES.length);
            gDelay(function () {
                var entry = document.getElementById("og-entry");
                if (entry) entry.classList.add("hot");
                ogFingerAt(entry);
            }, 260);
        },
        function () { // 2. 메가메뉴 열림 → 수강신청내역 탭
            ogInfo21Reset(); ogStepsOn(1, OG_INFO21_SCENES.length);
            var menu = document.getElementById("og-menu");
            if (menu) menu.classList.add("open");
            gDelay(function () {
                var item = document.getElementById("og-menu-item");
                if (item) item.classList.add("hot");
                ogFingerAt(item);
            }, 380);
        },
        function () { // 3. 표 확인 + 캡쳐(크롭 + 플래시)
            ogInfo21Reset(); ogStepsOn(2, OG_INFO21_SCENES.length);
            ogInfo21ShowTable();
            gDelay(function () { ogCropAt(document.getElementById("og-target")); }, 200);
            gDelay(function () {
                var flash = document.getElementById("og-flash");
                if (flash) { flash.classList.remove("flash"); void flash.offsetWidth; flash.classList.add("flash"); }
            }, 900);
        },
        function () { // 4. 완료
            ogInfo21Reset(); ogStepsOn(3, OG_INFO21_SCENES.length);
            ogInfo21ShowTable();
            var done = document.getElementById("og-done");
            if (done) done.classList.add("show");
        }
    ];

    var activeGuideScenes = null;

    function gDelay(fn, ms) { guideTimeouts.push(setTimeout(fn, ms)); }

    function stopGuideLoop() {
        if (guideTimer) { clearInterval(guideTimer); guideTimer = null; }
        guideTimeouts.forEach(function (id) { clearTimeout(id); });
        guideTimeouts = [];
    }

    function startGuideLoop(kind) {
        stopGuideLoop();
        activeGuideScenes = (kind === "info21") ? OG_INFO21_SCENES : OG_ETA_SCENES;
        guideIdx = 0;
        activeGuideScenes[0]();
        guideTimer = setInterval(function () {
            guideIdx = (guideIdx + 1) % activeGuideScenes.length;
            activeGuideScenes[guideIdx]();
        }, 3000);
    }

    // =====================================================================
    // UI: 직조 애니메이션(분석 중)
    // =====================================================================
    function renderWeaving() {
        stopTimers();
        var warps = "", wefts = "";
        var totalBatches = Math.max(1, chunk(files, BATCH_SIZE).length);
        for (var i = 0; i < 6; i++) warps += '<span class="warp" style="--i:' + i + '"></span>';
        for (var j = 0; j < 4; j++) wefts += '<span class="weft" style="--j:' + j + '"></span>';
        root().innerHTML =
            '<div class="ocr-weave">' +
                '<div class="ocr-loom" aria-hidden="true">' + warps + wefts + '</div>' +
                '<div class="ocr-phrase" id="ocr-phrase">' + PHRASES[0] + '</div>' +
                '<div class="ocr-prog" id="ocr-prog">0/' + totalBatches + '묶음 분석 중…</div>' +
            '</div>';
        var pi = 0;
        phraseTimer = setInterval(function () {
            pi = (pi + 1) % PHRASES.length;
            var el = document.getElementById("ocr-phrase");
            if (el) el.textContent = PHRASES[pi];
        }, 1400);
        var k = 0;
        progTimer = setInterval(function () {
            if (k < totalBatches) { k++; updateProgress(k, totalBatches); }
        }, 550);
    }

    function updateProgress(done, total) {
        var el = document.getElementById("ocr-prog");
        if (el) el.textContent = Math.min(done, total) + "/" + total + "묶음 분석 중…";
    }

    function startAnalyze() {
        if (!files.length) return;
        renderWeaving();
        callGemini().then(function (items) {
            stopTimers();
            renderResult(classify(items, curriculum));
        }).catch(function (err) {
            stopTimers();
            renderError(err && err.message ? err.message : "알 수 없는 오류");
        });
    }

    // =====================================================================
    // UI: 결과 확인표
    // =====================================================================
    function gradeSelectHtml(sel) {
        var opt = '<option value="">미입력</option>';
        opt += GRADE_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + k + '</option>'; }).join("");
        return '<select class="ocr-grade">' + opt + '</select>';
    }

    function mapSelectHtml() {
        var opt = '<option value="">전공 외 · 제외</option>';
        opt += curriculum.map(function (c) { return '<option value="' + c.code + '">' + c.name + ' (' + c.code + ')</option>'; }).join("");
        return '<select class="ocr-map">' + opt + '</select>';
    }

    function renderResult(rows) {
        stopTimers();
        var matched = rows.filter(function (r) { return r.match; });
        var unmatched = rows.filter(function (r) { return !r.match; });

        var html = '<div class="ocr-head"><div class="ocr-title">🧵 인식 결과</div>' +
            '<div class="ocr-sub">반영할 과목을 확인하세요. 체크 해제하면 제외됩니다.</div></div>';

        if (matched.length === 0 && unmatched.length === 0) {
            html += '<div class="ocr-empty">과목을 하나도 찾지 못했어요. 다른 스크린샷을 시도하거나 직접 선택으로 이어가세요.</div>';
        }

        if (matched.length) {
            html += '<div class="ocr-sec-t ok">✔ 전공 과목 ' + matched.length + '건</div><div class="ocr-rows">';
            matched.forEach(function (r) {
                html += '<div class="ocr-row ok" data-code="' + r.match.code + '">' +
                    '<input type="checkbox" class="ocr-inc" checked>' +
                    '<span class="ocr-nm">' + r.match.name + '</span>' +
                    '<span class="ocr-code">' + r.match.code + '</span>' +
                    '<span class="ocr-cr">' + r.match.credits + '학점</span>' +
                    gradeSelectHtml(r.grade) +
                    '</div>';
            });
            html += '</div>';
        }

        if (unmatched.length) {
            html += '<div class="ocr-sec-t warn">⚠ 확인 필요 ' + unmatched.length + '건 <small>(기본 제외 · 전공 과목이면 직접 지정)</small></div><div class="ocr-rows">';
            unmatched.forEach(function (r) {
                html += '<div class="ocr-row warn">' +
                    '<span class="ocr-nm">' + (r.name || "(이름 미상)") + (r.code ? ' <em>' + r.code + '</em>' : '') + '</span>' +
                    mapSelectHtml() +
                    gradeSelectHtml(r.grade) +
                    '</div>';
            });
            html += '</div>';
        }

        html += '<p class="ocr-privacy">🔒 원본 사진은 저장하지 않아요. 성적은 이 브라우저에만 반영됩니다.</p>' +
            '<div class="onboarding-nav">' +
                '<button class="onboarding-back-btn" id="ocr-retry" type="button">← 다시 업로드</button>' +
                '<div class="onboarding-nav-spacer"></div>' +
                '<button class="onboarding-submit onboarding-nav-btn" id="ocr-apply" type="button">로드맵에 반영</button>' +
            '</div>';

        root().innerHTML = html;
        document.getElementById("ocr-retry").addEventListener("click", renderUpload);
        document.getElementById("ocr-apply").addEventListener("click", applyResults);
    }

    // 결과표 → gradeMap 수집 후 onApply
    function collectGradeMap() {
        var gradeMap = {};
        root().querySelectorAll(".ocr-row.ok").forEach(function (row) {
            var inc = row.querySelector(".ocr-inc");
            if (inc && !inc.checked) return;
            var code = row.dataset.code;
            if (code) gradeMap[code] = (row.querySelector(".ocr-grade") || {}).value || "";
        });
        root().querySelectorAll(".ocr-row.warn").forEach(function (row) {
            var mapSel = row.querySelector(".ocr-map");
            var code = mapSel ? mapSel.value : "";
            if (!code) return; // 전공 외 · 제외
            gradeMap[code] = (row.querySelector(".ocr-grade") || {}).value || "";
        });
        return gradeMap;
    }

    function applyResults() {
        var gradeMap = collectGradeMap();
        if (Object.keys(gradeMap).length === 0) {
            msg2("반영할 과목이 없어요. 최소 한 과목을 포함하거나 직접 선택으로 이어가세요.");
            return;
        }
        if (opts.onApply) opts.onApply(gradeMap);
    }

    function msg2(t) {
        var nav = root().querySelector(".onboarding-nav");
        var m = root().querySelector(".ocr-inline-msg");
        if (!m && nav) { m = document.createElement("p"); m.className = "ocr-inline-msg"; nav.parentNode.insertBefore(m, nav); }
        if (m) m.textContent = t || "";
    }

    // =====================================================================
    // UI: 오류 → 좌절 없는 폴백
    // =====================================================================
    function renderError(message) {
        stopTimers();
        root().innerHTML =
            '<div class="ocr-error">😥 스크린샷을 읽지 못했어요.<br><span>' + message + '</span></div>' +
            '<p class="ocr-fallback">괜찮아요 — <b>직접 선택하기</b>로 이어서 할 수 있어요.</p>' +
            '<div class="onboarding-nav">' +
                '<button class="onboarding-back-btn" id="ocr-retry2" type="button">← 다시 시도</button>' +
                '<div class="onboarding-nav-spacer"></div>' +
                '<button class="onboarding-submit onboarding-nav-btn" id="ocr-tob2" type="button">직접 선택으로 이동</button>' +
            '</div>';
        document.getElementById("ocr-retry2").addEventListener("click", renderUpload);
        document.getElementById("ocr-tob2").addEventListener("click", function () { if (opts.onFallbackB) opts.onFallbackB(); });
    }

    function stopTimers() {
        if (phraseTimer) { clearInterval(phraseTimer); phraseTimer = null; }
        if (progTimer) { clearInterval(progTimer); progTimer = null; }
    }

    // 테스트 훅(브라우저 목업/노드 단위 검증용)
    function injectFilesForTest(arr) { files = arr || []; }
    function setCurriculumForTest(arr) { curriculum = arr || []; }

    return {
        isEnabled: isEnabled,
        enter: enter,
        // 순수 로직(테스트용)
        _classify: classify,
        _normGrade: normGrade,
        _parseGemini: parseGemini,
        _buildPrompt: buildPrompt,
        _fuzzyNameMatch: fuzzyNameMatch,
        _hangulToJamo: hangulToJamo,
        _editDistance: editDistance,
        _injectFilesForTest: injectFilesForTest,
        _setCurriculumForTest: setCurriculumForTest,
        _renderResult: renderResult,
        _collectGradeMap: collectGradeMap
    };
})();
