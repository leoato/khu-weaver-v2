    let courses = [
        // 1학년 1학기
        {code:"AMTH1009", name:"미분적분학", type:"전공 기초", credits:3, year:1, sem:1, track:"MATH"},
        {code:"AMTH1004", name:"선형대수", type:"전공 기초", credits:3, year:1, sem:1, track:"MATH"},
        {code:"APHY1002", name:"물리학및실험1", type:"전공 기초", credits:3, year:1, sem:1, track:"PHYS"},
        {code:"SWCON104", name:"웹/파이선프로그래밍", type:"전공 기초", credits:3, year:1, sem:1, track:"COMP"},
        
        // 1학년 2학기
        {code:"AMTH1003", name:"고급미분적분학", type:"전공 기초", credits:3, year:1, sem:2, track:"MATH"},
        {code:"APHY1003", name:"물리학및실험2", type:"전공 기초", credits:3, year:1, sem:2, track:"PHYS"},
        {code:"AMTH1001", name:"미분방정식", type:"전공 필수", credits:3, year:1, sem:2, track:"MATH"},
        
        // 2학년 1학기
        {code:"EE209", name:"논리회로", type:"전공 필수", credits:3, year:2, sem:1, track:"CSY"},
        {code:"EE201", name:"전자기학1", type:"전공 필수", credits:3, year:2, sem:1, track:"SW"},
        {code:"EE202", name:"회로이론", type:"전공 필수", credits:3, year:2, sem:1, track:"CSY"},
        {code:"EE203", name:"물리전자", type:"전공 필수", credits:3, year:2, sem:1, track:"SW"},
        {code:"EE213", name:"객체지향프로그래밍", type:"전공 기초", credits:3, year:2, sem:1, track:"COMP"},
        
        // 2학년 2학기
        {code:"EE207", name:"기초회로실험", type:"전공 필수", credits:2, year:2, sem:2, track:"CSY"},
        {code:"EE241", name:"자료구조및알고리즘", type:"전공 선택", credits:3, year:2, sem:2, track:"COMP"},
        {code:"EE211", name:"확률및랜덤변수", type:"전공 기초", credits:3, year:2, sem:2, track:"CS"},
        {code:"EE210", name:"신호와시스템", type:"전공 필수", credits:3, year:2, sem:2, track:"CS"},
        {code:"EE204", name:"전자기학2", type:"전공 선택", credits:3, year:2, sem:2, track:"SW", isMinor:true},
        {code:"EE242", name:"회로이론2", type:"전공 선택", credits:3, year:2, sem:2, track:"CSY", isMinor:true},
        
        // 3학년 1학기
        {code:"EE206", name:"전자회로1", type:"전공 필수", credits:3, year:3, sem:1, track:"CSY"},
        {code:"EE321", name:"반도체공학", type:"전공 선택", credits:3, year:3, sem:1, track:"SW"},
        {code:"EE328", name:"반도체공정", type:"전공 선택", credits:3, year:3, sem:1, track:"SW"},
        {code:"EE341", name:"디지털통신", type:"전공 선택", credits:3, year:3, sem:1, track:"CS"},
        {code:"EE342", name:"디지털신호처리", type:"전공 선택", credits:3, year:3, sem:1, track:"CS"},
        {code:"EE364", name:"마이크로프로세서", type:"전공 선택", credits:3, year:3, sem:1, track:"CSY"},
        {code:"EE361", name:"디지털회로설계", type:"전공 선택", credits:3, year:3, sem:1, track:"CSY", isMinor:true},
        {code:"EE362", name:"집적회로실험", type:"전공 선택", credits:2, year:3, sem:1, track:"CSY", isMinor:true},
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
        {code:"EE497", name:"종합설계", type:"전공 필수", credits:3, year:4, sem:1, track:"CSY"},
        {code:"EE421", name:"광전자공학", type:"전공 선택", credits:3, year:4, sem:1, track:"SW", isMinor:true},
        {code:"EE442", name:"이동통신", type:"전공 선택", credits:3, year:4, sem:1, track:"CS", isMinor:true},
        {code:"EE443", name:"무선데이타통신", type:"전공 선택", credits:3, year:4, sem:1, track:"CS", isMinor:true},
        {code:"EE444", name:"영상신호처리", type:"전공 선택", credits:3, year:4, sem:1, track:"CS", isMinor:true},
        {code:"EE496", name:"반도체집적회로", type:"전공 선택", credits:3, year:4, sem:1, track:"SW", isMinor:true},
        {code:"EE486", name:"졸업논문", type:"전공 필수", credits:0, year:4, sem:1, track:"CSY", isMinor:true},
        
        // 4학년 2학기
        {code:"EE470", name:"SoC설계", type:"전공 선택", credits:3, year:4, sem:2, track:"CSY"},
        {code:"EE423", name:"디스플레이공학", type:"전공 선택", credits:3, year:4, sem:2, track:"SW", isMinor:true},
        {code:"EE445", name:"실감미디어시스템", type:"전공 선택", credits:3, year:4, sem:2, track:"CS", isMinor:true},
        {code:"EE461", name:"로봇제어공학", type:"전공 선택", credits:3, year:4, sem:2, track:"CSY", isMinor:true}
    ];

    // 2. 엄밀한 선후수 규칙 정의 (Adventure Design 제거 및 28개 신규 전공선택 연동 확장)
    let prerequisites = [
        {target:"AMTH1003", prereqs:["AMTH1009"]},
        {target:"APHY1003", prereqs:["APHY1002"]},
        {target:"AMTH1001", prereqs:["AMTH1009"]},
        {target:"EE213", prereqs:["SWCON104"]},
        {target:"EE207", prereqs:["EE202"]},
        {target:"EE206", prereqs:["EE202"]},
        {target:"EE210", prereqs:["AMTH1009"]},
        {target:"EE204", prereqs:["EE201"]},
        {target:"EE242", prereqs:["EE202"]},
        {target:"EE321", prereqs:["EE203"]},
        {target:"EE328", prereqs:["EE203"]},
        {target:"EE365", prereqs:["EE206"]},
        {target:"EE341", prereqs:["EE210", "EE211"]},
        {target:"EE342", prereqs:["EE210"]},
        {target:"EE367", prereqs:["EE209"]},
        {target:"EE463", prereqs:["EE206"]},
        {target:"EE470", prereqs:["EE206"]},
        {target:"EE497", prereqs:["EE207", "EE210", "EE213"]},
        
        // 신규 추가 과목 연계 규칙
        {target:"EE361", prereqs:["EE209"]},
        {target:"EE362", prereqs:["EE209"]},
        {target:"EE363", prereqs:["EE202"]},
        {target:"CSE203", prereqs:["EE209"]},
        {target:"CSE302", prereqs:["EE209"]},
        {target:"EE325", prereqs:["EE201"]},
        {target:"EE366", prereqs:["EE206"]},
        {target:"EE370", prereqs:["SWCON104"]},
        {target:"EE441", prereqs:["EE211"]},
        {target:"EE343", prereqs:["EE210"]},
        {target:"EE324", prereqs:["EE201", "EE210"]},
        {target:"EE421", prereqs:["EE203"]},
        {target:"EE442", prereqs:["EE341"]},
        {target:"EE443", prereqs:["EE211"]},
        {target:"EE444", prereqs:["EE210"]},
        {target:"EE496", prereqs:["EE206"]},
        {target:"EE423", prereqs:["EE203"]},
        {target:"EE445", prereqs:["EE210"]},
        {target:"EE461", prereqs:["EE202"]}
    ];

    // 3. 5대 핵심 진로 트랙 맞춤 과목 정의 (Adventure Design 제거 및 논리회로 연동)
    let tracks = {
        semiconductor: ["AMTH1009", "APHY1002", "APHY1003", "EE201", "EE203", "EE321", "EE328", "EE422"],
        embedded: ["SWCON104", "EE209", "EE213", "EE364", "EE367", "EE470", "EE497"],
        ai: ["AMTH1009", "AMTH1004", "SWCON104", "EE213", "EE210", "EE342", "EE371"],
        telecom: ["AMTH1009", "APHY1002", "EE201", "EE210", "EE211", "EE341", "EE422"],
        circuit: ["EE202", "EE209", "EE207", "EE206", "EE365", "EE463", "EE470"]
    };

    /* =========================================================================
     * 교육과정 등록 (Curriculum Registration)
     * - 위에서 선언한 courses/prerequisites/tracks는 app.js가 초기 렌더에 사용하는
     *   '기본 전역 데이터' 역할도 겸합니다. (registry.js의 폴백도 이 전역을 참조)
     * - 학과/학번 목록과 getCurriculum 조회 함수는 registry.js가 소유합니다.
     *   (이 파일은 자기 데이터만 window.CURRICULA["EE"]["2025"]에 주입)
     * ========================================================================= */
    window.CURRICULA = window.CURRICULA || {};
    window.CURRICULA["EE"] = window.CURRICULA["EE"] || {};
    window.CURRICULA["EE"]["2025"] = {
        gradReq: 130,
        courses: courses,
        prerequisites: prerequisites,
        tracks: tracks
    };
