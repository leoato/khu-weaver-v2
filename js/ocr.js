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

        if (kind === "info21") {
            body.innerHTML =
                '<div class="ocr-guide-stage info21">' +
                    '<div class="mock-info21-title">2025 / 2학기</div>' +
                    '<div class="mock-info21-summary"><span>총과목<br><b>6</b></span><span>취득학점<br><b>15</b></span><span>평점평균<br><b>4.06</b></span></div>' +
                    '<div class="mock-table">' +
                        '<div class="mock-row head"><span>강좌코드</span><span>과목명</span><span>학점</span><span>등급</span></div>' +
                        '<div class="mock-row"><span>SWCON104</span><span>웹/파이썬프로그래밍</span><span>3</span><span>A+</span></div>' +
                        '<div class="mock-row"><span>AMTH1001</span><span>미분방정식</span><span>3</span><span>A-</span></div>' +
                        '<div class="mock-row"><span>APHY1003</span><span>물리학및실험2</span><span>3</span><span>A0</span></div>' +
                    '</div>' +
                    '<div class="ocr-crop-box"></div>' +
                '</div>' +
                '<ol class="ocr-guide-steps"><li>인포21 성적조회에서 학기별 상세 표를 엽니다.</li><li>과목명, 학점, 등급이 보이는 표 영역을 캡쳐합니다.</li><li>상단 요약만 캡쳐하지 말고 과목 행까지 포함해주세요.</li></ol>';
        } else {
            body.innerHTML =
                '<div class="ocr-guide-stage eta">' +
                    '<div class="mock-phone-bar">00:04 <span>64%</span></div>' +
                    '<div class="mock-eta-title">학점계산기</div>' +
                    '<div class="mock-eta-tabs">1학년 1학기&nbsp;&nbsp; 1학년 2학기&nbsp;&nbsp; 2학년 1학기</div>' +
                    '<div class="mock-eta-chart"><span>A+ 33%</span><span>B+ 22%</span><span>A0 22%</span></div>' +
                    '<div class="mock-eta-sem">1학년 1학기 <b>평점 3.48 · 취득 18</b></div>' +
                    '<div class="mock-table eta-table">' +
                        '<div class="mock-row head"><span>과목명</span><span>학점</span><span>성적</span></div>' +
                        '<div class="mock-row"><span>미분적분학</span><span>3</span><span>B-</span></div>' +
                        '<div class="mock-row"><span>선형대수</span><span>3</span><span>C+</span></div>' +
                        '<div class="mock-row"><span>물리학및실험1</span><span>3</span><span>A+</span></div>' +
                    '</div>' +
                    '<div class="ocr-crop-box"></div>' +
                '</div>' +
                '<ol class="ocr-guide-steps"><li>에타 학점계산기에서 학기 탭을 엽니다.</li><li>과목명, 학점, 성적이 보이는 표 영역을 캡쳐합니다.</li><li>여러 학기는 여러 장으로 나눠 올려도 됩니다.</li></ol>';
        }
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
