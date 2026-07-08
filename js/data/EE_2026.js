// 전역 객체 초기화 (안전장치)
window.CURRICULA = window.CURRICULA || {};
window.CURRICULA["EE"] = window.CURRICULA["EE"] || {};

// -------------------------------------------------------------------------
// [경희대학교 전자공학과 2026학년도 교육과정 데이터]
// 출처: 전자공학부 홈페이지(ee.khu.ac.kr) > 학부 > 교육과정 >
//       "2026학년도 전자공학과 교육과정.pdf" (등록 2026-04-15)
//   · 과목/학수번호/학점/이수학년/개설학기 : [별표1] 교육과정 편성표 (51과목)
//   · 선수과목(prerequisites)             : [별표4] 선수과목 지정표 (39건)
//   · 트랙(tracks)                        : [별표2] 전공심화 분류 (통신·신호 / 회로·시스템 / 반도체·파동)
//   · 졸업이수학점 130 (전공기초25+전공필수23+전공선택28=76)  : 제3조 [표1], 제11조
// 비고: 개설학기가 1·2학기 동시개설인 과목은 [별표3] 학년별 편성표의 주(主)개설학기 기준으로 1개 슬롯 배치.
// -------------------------------------------------------------------------
window.CURRICULA["EE"]["2026"] = {
    gradReq: 130, // 최저 졸업이수학점 (제11조)
    courses: [
        // ===== 전공기초 (25학점) =====
        // 1학년 1학기
        {code:"AMTH1009", name:"미분적분학", type:"전공 기초", credits:3, year:1, sem:1, track:"MATH"},
        {code:"AMTH1004", name:"선형대수", type:"전공 기초", credits:3, year:1, sem:1, track:"MATH"},
        {code:"APHY1002", name:"물리학및실험1", type:"전공 기초", credits:3, year:1, sem:1, track:"PHYS"},
        {code:"SWCON104", name:"웹/파이선프로그래밍", type:"전공 기초", credits:3, year:1, sem:1, track:"COMP"},
        // 1학년 2학기
        {code:"AMTH1003", name:"고급미분적분학", type:"전공 기초", credits:3, year:1, sem:2, track:"MATH"},
        {code:"APHY1003", name:"물리학및실험2", type:"전공 기초", credits:3, year:1, sem:2, track:"PHYS"},
        {code:"AMTH1001", name:"미분방정식", type:"전공 기초", credits:3, year:1, sem:2, track:"MATH"},
        // 2학년 1학기
        {code:"EE213", name:"객체지향프로그래밍및실습", type:"전공 기초", credits:3, year:2, sem:1, track:"COMP"},
        // 2학년 2학기
        {code:"EE211", name:"확률및랜덤변수", type:"전공 기초", credits:3, year:2, sem:2, track:"CS"},

        // ===== 전공필수 (23학점) =====
        // 2학년 1학기
        {code:"EE209", name:"논리회로", type:"전공 필수", credits:3, year:2, sem:1, track:"CSY"},
        {code:"EE201", name:"전자기학1", type:"전공 필수", credits:3, year:2, sem:1, track:"SW"},
        {code:"EE202", name:"회로이론", type:"전공 필수", credits:3, year:2, sem:1, track:"CSY"},
        {code:"EE203", name:"물리전자", type:"전공 필수", credits:3, year:2, sem:1, track:"SW"},
        // 2학년 2학기
        {code:"EE207", name:"기초회로실험", type:"전공 필수", credits:2, year:2, sem:2, track:"CSY"},
        {code:"EE210", name:"신호와시스템", type:"전공 필수", credits:3, year:2, sem:2, track:"CS"},
        // 3학년 1학기
        {code:"EE206", name:"전자회로1", type:"전공 필수", credits:3, year:3, sem:1, track:"CSY"},
        // 4학년 1학기
        {code:"EE497", name:"종합설계(전자공학)", type:"전공 필수", credits:3, year:4, sem:1, track:"CSY"},
        {code:"EE486", name:"졸업논문(전자공학)", type:"전공 필수", credits:0, year:4, sem:1, track:"CSY", isMinor:true},

        // ===== 전공선택 (28학점 이상) =====
        // 2학년 2학기
        {code:"EE241", name:"자료구조및알고리즘", type:"전공 선택", credits:3, year:2, sem:2, track:"COMP"},
        {code:"EE204", name:"전자기학2", type:"전공 선택", credits:3, year:2, sem:2, track:"SW", isMinor:true},
        {code:"EE242", name:"회로이론2", type:"전공 선택", credits:3, year:2, sem:2, track:"CSY", isMinor:true},
        // 3학년 1학기
        {code:"EE321", name:"반도체공학", type:"전공 선택", credits:3, year:3, sem:1, track:"SW"},
        {code:"EE328", name:"반도체공정", type:"전공 선택", credits:3, year:3, sem:1, track:"SW"},
        {code:"EE341", name:"디지털통신", type:"전공 선택", credits:3, year:3, sem:1, track:"CS"},
        {code:"EE342", name:"디지털신호처리", type:"전공 선택", credits:3, year:3, sem:1, track:"CS"},
        {code:"EE364", name:"마이크로프로세서", type:"전공 선택", credits:3, year:3, sem:1, track:"CSY"},
        {code:"EE361", name:"디지털회로설계및언어", type:"전공 선택", credits:3, year:3, sem:1, track:"CSY", isMinor:true},
        {code:"EE362", name:"디지털집적회로모델링실험", type:"전공 선택", credits:2, year:3, sem:1, track:"CSY", isMinor:true},
        {code:"EE363", name:"자동제어", type:"전공 선택", credits:3, year:3, sem:1, track:"CSY", isMinor:true},
        {code:"CSE203", name:"컴퓨터구조", type:"전공 선택", credits:3, year:3, sem:1, track:"COMP", isMinor:true},
        {code:"CSE302", name:"컴퓨터네트워크", type:"전공 선택", credits:3, year:3, sem:1, track:"CS", isMinor:true},
        // 3학년 2학기
        {code:"EE365", name:"전자회로2", type:"전공 선택", credits:3, year:3, sem:2, track:"CSY"},
        {code:"EE367", name:"임베디드시스템설계", type:"전공 선택", credits:3, year:3, sem:2, track:"CSY"},
        {code:"EE371", name:"머신러닝개론", type:"전공 선택", credits:3, year:3, sem:2, track:"COMP"},
        {code:"EE366", name:"전자회로실험", type:"전공 선택", credits:2, year:3, sem:2, track:"CSY", isMinor:true},
        {code:"EE325", name:"초고주파공학", type:"전공 선택", credits:3, year:3, sem:2, track:"SW", isMinor:true},
        {code:"EE370", name:"소프트웨어랩", type:"전공 선택", credits:2, year:3, sem:2, track:"COMP", isMinor:true},
        {code:"EE441", name:"정보및부호이론", type:"전공 선택", credits:3, year:3, sem:2, track:"CS", isMinor:true},
        {code:"EE343", name:"DSP실험", type:"전공 선택", credits:2, year:3, sem:2, track:"CS", isMinor:true},
        {code:"EE324", name:"전파통신실험", type:"전공 선택", credits:2, year:3, sem:2, track:"CS", isMinor:true},
        // 4학년 1학기
        {code:"EE422", name:"안테나공학", type:"전공 선택", credits:3, year:4, sem:1, track:"SW"},
        {code:"EE463", name:"VLSI설계", type:"전공 선택", credits:3, year:4, sem:1, track:"CSY"},
        {code:"EE421", name:"광전자공학", type:"전공 선택", credits:3, year:4, sem:1, track:"SW", isMinor:true},
        {code:"EE442", name:"이동통신", type:"전공 선택", credits:3, year:4, sem:1, track:"CS", isMinor:true},
        {code:"EE443", name:"무선데이타통신", type:"전공 선택", credits:3, year:4, sem:1, track:"CS", isMinor:true},
        {code:"EE444", name:"영상신호처리", type:"전공 선택", credits:3, year:4, sem:1, track:"CS", isMinor:true},
        {code:"EE496", name:"반도체집적회로", type:"전공 선택", credits:3, year:4, sem:1, track:"SW", isMinor:true},
        // 4학년 2학기
        {code:"EE470", name:"SoC설계", type:"전공 선택", credits:3, year:4, sem:2, track:"CSY"},
        {code:"EE423", name:"디스플레이공학", type:"전공 선택", credits:3, year:4, sem:2, track:"SW", isMinor:true},
        {code:"EE445", name:"실감미디어시스템", type:"전공 선택", credits:3, year:4, sem:2, track:"CS", isMinor:true},
        {code:"EE461", name:"로봇제어공학", type:"전공 선택", credits:3, year:4, sem:2, track:"CSY", isMinor:true}
    ],

    // [별표4] 선수과목 지정표 (39건). {target: 후수과목, prereqs: [선수과목...]}
    prerequisites: [
        {target:"AMTH1003", prereqs:["AMTH1009"]},          // 고급미분적분학 ← 미분적분학
        {target:"APHY1003", prereqs:["APHY1002"]},          // 물리학및실험2 ← 물리학및실험1
        {target:"EE213", prereqs:["SWCON104"]},             // 객체지향프로그래밍및실습 ← 웹/파이선프로그래밍
        {target:"CSE203", prereqs:["EE209"]},               // 컴퓨터구조 ← 논리회로
        {target:"EE204", prereqs:["EE201"]},                // 전자기학2 ← 전자기학1
        {target:"EE206", prereqs:["EE202"]},                // 전자회로1 ← 회로이론
        {target:"EE207", prereqs:["EE202"]},                // 기초회로실험 ← 회로이론
        {target:"EE210", prereqs:["AMTH1009"]},             // 신호와시스템 ← 미분적분학(별표4 학수번호 기준)
        {target:"CSE302", prereqs:["EE209"]},               // 컴퓨터네트워크 ← 논리회로
        {target:"EE321", prereqs:["EE203"]},                // 반도체공학 ← 물리전자
        {target:"EE328", prereqs:["EE203"]},                // 반도체공정 ← 물리전자
        {target:"EE324", prereqs:["EE201", "EE210"]},       // 전파통신실험 ← 전자기학1, 신호와시스템 (모두 수강)
        {target:"EE325", prereqs:["EE201"]},                // 초고주파공학 ← 전자기학1
        {target:"EE341", prereqs:["EE211", "EE210"]},       // 디지털통신 ← 확률및랜덤변수, 신호와시스템 (모두 수강)
        {target:"EE342", prereqs:["EE210"]},                // 디지털신호처리 ← 신호와시스템
        {target:"EE343", prereqs:["EE210"]},                // DSP실험 ← 신호와시스템
        {target:"EE241", prereqs:["EE213"]},                // 자료구조및알고리즘 ← 객체지향프로그래밍및실습
        {target:"EE361", prereqs:["EE209"]},                // 디지털회로설계및언어 ← 논리회로
        {target:"EE362", prereqs:["EE209"]},                // 디지털집적회로모델링실험 ← 논리회로
        {target:"EE363", prereqs:["EE202"]},                // 자동제어 ← 회로이론
        {target:"EE364", prereqs:["EE209"]},                // 마이크로프로세서 ← 논리회로
        {target:"EE365", prereqs:["EE206"]},                // 전자회로2 ← 전자회로1
        {target:"EE366", prereqs:["EE206"]},                // 전자회로실험 ← 전자회로1
        {target:"EE367", prereqs:["EE209"]},                // 임베디드시스템설계 ← 논리회로
        {target:"EE370", prereqs:["SWCON104"]},             // 소프트웨어랩 ← 웹/파이선프로그래밍
        {target:"EE371", prereqs:["AMTH1004", "EE211"]},    // 머신러닝개론 ← 선형대수, 확률및랜덤변수 (모두 수강)
        {target:"EE421", prereqs:["EE203"]},                // 광전자공학 ← 물리전자
        {target:"EE422", prereqs:["EE201"]},                // 안테나공학 ← 전자기학1
        {target:"EE423", prereqs:["EE203"]},                // 디스플레이공학 ← 물리전자
        {target:"EE441", prereqs:["EE211"]},                // 정보및부호이론 ← 확률및랜덤변수
        {target:"EE442", prereqs:["EE341"]},                // 이동통신 ← 디지털통신
        {target:"EE443", prereqs:["EE211"]},                // 무선데이타통신 ← 확률및랜덤변수
        {target:"EE444", prereqs:["EE210"]},                // 영상신호처리 ← 신호와시스템
        {target:"EE496", prereqs:["EE206"]},                // 반도체집적회로 ← 전자회로1
        {target:"EE463", prereqs:["EE206"]},                // VLSI설계 ← 전자회로1
        {target:"EE445", prereqs:["EE210"]},                // 실감미디어시스템 ← 신호와시스템
        {target:"EE497", prereqs:["EE207", "EE210", "EE213"]}, // 종합설계 ← 기초회로실험, 신호와시스템, 객체지향프로그래밍및실습 (모두 수강)
        {target:"EE470", prereqs:["EE206"]},                // SoC설계 ← 전자회로1
        {target:"EE242", prereqs:["EE202"]}                 // 회로이론2 ← 회로이론
    ],

    // [별표2] 전공심화 분류 기반 진로 트랙별 추천 과목
    tracks: {
        // 반도체/공정 (반도체 및 파동 + 반도체 소자)
        semiconductor: ["APHY1002", "APHY1003", "EE201", "EE203", "EE204", "EE321", "EE328", "EE325", "EE421", "EE423", "EE422", "EE496"],
        // 임베디드/IoT
        embedded: ["SWCON104", "EE209", "EE213", "EE364", "EE367", "EE470", "EE463", "EE497"],
        // 인공지능/신호처리
        ai: ["AMTH1009", "AMTH1004", "SWCON104", "EE213", "EE210", "EE342", "EE371", "EE444"],
        // 통신/신호처리 (별표2: 통신 및 신호처리)
        telecom: ["AMTH1009", "APHY1002", "EE201", "EE210", "EE211", "EE341", "EE441", "EE442", "EE443", "EE445"],
        // 회로/시스템 설계 (별표2: 회로 및 시스템)
        circuit: ["EE202", "EE209", "EE207", "EE206", "EE242", "EE365", "EE463", "EE470", "EE361", "EE461"]
    }
};
