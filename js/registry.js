/* =========================================================================
 * 학과 / 학번 레지스트리 (Data Registry)
 * - 각 학과별 데이터 파일(예: EE_2023.js)이 로드되면서 window.CURRICULA에 데이터를 주입합니다.
 * - 이 파일은 주입된 데이터를 바탕으로 온보딩 화면을 구성하고 맵핑하는 목차 역할을 합니다.
 * ========================================================================= */

// 전역 객체 초기화 보장
window.CURRICULA = window.CURRICULA || {};

window.DEPARTMENTS = [
    {
        code: "EE",
        name: "전자공학과",
        available: true,
        // 실제 데이터 파일이 확보된 학번 목록 (향후 데이터 추가 시 여기에 연도만 적어주면 자동 연동)
        // 미보유 학번 선택 시 getCurriculum이 최신(2026)으로 폴백.
        curriculumYears: ["2026", "2025", "2024", "2023", "2022", "2021", "2020"],
        note: "전자공학과 맞춤형 지능형 로드맵이 활성화되었습니다."
    },
    {
        code: "BME",
        name: "생체의공학과",
        available: false,
        curriculumYears: [],
        note: "생체의공학과 데이터는 현재 수집 중입니다. (준비 중)"
    },
    {
        code: "CSE",
        name: "컴퓨터공학과",
        available: false,
        curriculumYears: [],
        note: "컴퓨터공학과 데이터는 현재 수집 중입니다. (준비 중)"
    }
];

// 온보딩 학번 선택 후보 (입학년도)
window.ADMISSION_YEARS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020"];

// 학과+학번 → 적용할 교육과정 데이터 반환
window.getCurriculum = function (deptCode, year) {
    const dept = window.CURRICULA[deptCode] || {};
    const matched = dept[year];

    // 데이터가 없는 학번을 선택했을 때 에러를 뿜지 않고 최신(2026) → 2025 순으로 방어(Fallback)
    return matched || dept["2026"] || dept["2025"] || { courses: courses, prerequisites: prerequisites, tracks: tracks, gradReq: 130 };
};
