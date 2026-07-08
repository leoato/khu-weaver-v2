#!/usr/bin/env node
/* =========================================================================
 * KHU-Weaver 교육과정 데이터 무결성 검증기 v1.0
 * 사용법:  node tools/validate_curriculum.js js/data/EE_2024.js [추가파일...]
 *          node tools/validate_curriculum.js --all   (js/data/ 전체 검증)
 * 기준 문서: docs/DATA_SCHEMA.md
 * 종료코드: 0 = 전체 PASS(경고 허용), 1 = 에러 존재
 * ========================================================================= */
const fs = require("fs");
const path = require("path");

// 학과별 허용 track 코드 (타과 확장 시 여기와 DATA_SCHEMA.md에 함께 추가)
const TRACK_CODES = {
    EE: ["MATH", "PHYS", "COMP", "CS", "CSY", "SW"],
};
// 학과별 tracks{} 필수 키 (앱 레이더/추천이 참조)
const TRACK_KEYS = {
    EE: ["semiconductor", "embedded", "ai", "telecom", "circuit"],
};
const TYPES = ["전공 기초", "전공 필수", "전공 선택"];
const CODE_RE = /^[A-Z]{2,6}[0-9]{3,4}$/;

function loadFile(file) {
    const src = fs.readFileSync(file, "utf8");
    const window = { CURRICULA: {} };
    new Function("window", src)(window); // 데이터 파일은 window에만 주입한다는 전제(스키마 §2)
    return window.CURRICULA;
}

function validate(file) {
    const errors = [];
    const warns = [];
    const E = (m) => errors.push(m);
    const W = (m) => warns.push(m);

    let cur;
    try {
        cur = loadFile(file);
    } catch (e) {
        return { file, errors: [`JS 실행 실패: ${e.message}`], warns: [], info: "" };
    }

    const depts = Object.keys(cur);
    if (depts.length !== 1) E(`파일 하나에 학과 ${depts.length}개 주입됨 (1개여야 함): ${depts.join(",")}`);

    let info = "";
    for (const dept of depts) {
        const years = Object.keys(cur[dept]);
        if (years.length !== 1) E(`[${dept}] 파일 하나에 학번 ${years.length}개 주입됨 (1개여야 함)`);
        // 파일명 규칙 대조
        const base = path.basename(file, ".js");
        if (years.length === 1 && base !== `${dept}_${years[0]}`)
            W(`파일명 '${base}' ≠ 주입키 '${dept}_${years[0]}' — 네이밍 규칙 확인`);

        for (const year of years) {
            const d = cur[dept][year];
            const tag = `[${dept} ${year}]`;

            // gradReq
            if (typeof d.gradReq !== "number" || d.gradReq <= 0) E(`${tag} gradReq가 양수가 아님: ${d.gradReq}`);

            // courses
            if (!Array.isArray(d.courses) || d.courses.length === 0) {
                E(`${tag} courses가 비어있음`);
                continue;
            }
            const codes = new Set();
            const sums = {};
            d.courses.forEach((c, i) => {
                const t = `${tag} courses[${i}] ${c.code || "?"}`;
                if (!CODE_RE.test(c.code || "")) E(`${t}: code 형식 위반`);
                if (codes.has(c.code)) E(`${t}: code 중복`);
                codes.add(c.code);
                if (!c.name || /\s/.test(c.name)) (c.name ? W : E)(`${t}: name ${c.name ? "에 공백 포함" : "누락"}`);
                if (!TYPES.includes(c.type)) E(`${t}: type '${c.type}' — 허용값 아님(띄어쓰기 확인)`);
                if (!Number.isInteger(c.credits) || c.credits < 0 || c.credits > 4) E(`${t}: credits ${c.credits}`);
                if (![1, 2, 3, 4].includes(c.year)) E(`${t}: year ${c.year}`);
                if (![1, 2].includes(c.sem)) E(`${t}: sem ${c.sem}`);
                const tc = TRACK_CODES[dept];
                if (tc && !tc.includes(c.track)) E(`${t}: track '${c.track}' — 허용값 아님`);
                if ("isMinor" in c && c.isMinor !== true) W(`${t}: isMinor는 true 또는 생략만`);
                sums[c.type] = (sums[c.type] || 0) + (c.credits || 0);
            });

            // prerequisites
            if (!Array.isArray(d.prerequisites)) E(`${tag} prerequisites가 배열이 아님`);
            else {
                const targets = new Set();
                d.prerequisites.forEach((p, i) => {
                    const t = `${tag} prerequisites[${i}] ${p.target || "?"}`;
                    if (!codes.has(p.target)) E(`${t}: target이 courses에 없음`);
                    if (targets.has(p.target)) W(`${t}: target 중복 항목 (하나로 합칠 것)`);
                    targets.add(p.target);
                    if (!Array.isArray(p.prereqs) || p.prereqs.length === 0) E(`${t}: prereqs 비어있음`);
                    else p.prereqs.forEach((q) => {
                        if (!codes.has(q)) E(`${t}: 선수과목 '${q}'가 courses에 없음`);
                        if (q === p.target) E(`${t}: 자기 자신을 선수과목으로 참조`);
                    });
                });
            }

            // tracks
            const keys = TRACK_KEYS[dept];
            if (!d.tracks || typeof d.tracks !== "object") E(`${tag} tracks 누락`);
            else {
                if (keys) {
                    keys.forEach((k) => { if (!Array.isArray(d.tracks[k])) E(`${tag} tracks.${k} 누락`); });
                    Object.keys(d.tracks).forEach((k) => { if (!keys.includes(k)) E(`${tag} tracks에 허용 외 키 '${k}'`); });
                }
                Object.entries(d.tracks).forEach(([k, arr]) => {
                    (arr || []).forEach((q) => { if (!codes.has(q)) E(`${tag} tracks.${k}: '${q}'가 courses에 없음`); });
                    if (Array.isArray(arr) && arr.length === 0) W(`${tag} tracks.${k}가 비어있음`);
                });
            }

            const sumStr = TYPES.map((t) => `${t} ${sums[t] || 0}학점`).join(" / ");
            info = `${tag} 과목 ${d.courses.length}개, 선수 ${Array.isArray(d.prerequisites) ? d.prerequisites.length : "?"}건, gradReq ${d.gradReq} | ${sumStr} (합 ${Object.values(sums).reduce((a, b) => a + b, 0)}) — PDF 편성표 합계와 눈으로 대조할 것`;
        }
    }
    return { file, errors, warns, info };
}

// ---- main ----
let files = process.argv.slice(2);
if (files[0] === "--all") {
    const dir = path.join(__dirname, "..", "js", "data");
    files = fs.readdirSync(dir)
        .filter((f) => /^[A-Z]{2,6}_[0-9]{4}\.js$/.test(f))
        .map((f) => path.join(dir, f));
}
if (files.length === 0) {
    console.log("사용법: node tools/validate_curriculum.js <데이터파일.js> ...  또는 --all");
    process.exit(1);
}

let fail = false;
for (const f of files) {
    const r = validate(f);
    const status = r.errors.length ? "❌ FAIL" : r.warns.length ? "⚠️ PASS(경고)" : "✅ PASS";
    console.log(`\n${status}  ${path.basename(r.file)}`);
    if (r.info) console.log("  " + r.info);
    r.errors.forEach((m) => console.log("  [에러] " + m));
    r.warns.forEach((m) => console.log("  [경고] " + m));
    if (r.errors.length) fail = true;
}
process.exit(fail ? 1 : 0);
