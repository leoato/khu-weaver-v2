# [브리프] EE_2023.js 무결성 버그 수정 (이슈 I-1)

> 대상 모델: 소넷 · 이 수정은 사용자가 승인한 건이므로 해당 파일의 **해당 부분만** 수정 가능.

## 문제
`khu-weaver_v1/js/data/EE_2023.js`의 prerequisites에 `{target:"EE324", prereqs:["EE201","EE210"]}` 항목이 있으나(95행 부근), EE324(전파통신실험)가 courses 배열에 없음. 검증기 FAIL 원인.

## 수행
1. 2023학년도 전자공학과 교육과정 PDF에서 [별표1]에 전파통신실험(EE324)이 편성되어 있는지 확인
   (PDF 확보 방법: `tasks/TASK_CRAWL_EE.md`의 1단계와 동일, 연도만 2023)
2. 분기:
   - **PDF에 있음** → courses에 EE324 과목 1줄 추가 (EE_2025.js의 EE324 줄 형식 참고: `{code:"EE324", name:"전파통신실험", type:"전공 선택", credits:2, year:3, sem:2, track:"CS", isMinor:true}` — 단, 학점·학년·학기는 2023 PDF 기준으로)
   - **PDF에 없음** → prerequisites에서 EE324 항목 1줄 삭제
3. 그 외 어떤 줄도 수정 금지.
4. 검증: `cd "khu-weaver_v1" && node tools/validate_curriculum.js js/data/EE_2023.js` → PASS 확인
5. `tasks/STATUS.md` 맨 아래에 1줄 보고: `| F-2023 | EE_2023.js | 수정내용 요약 | PASS | 근거(별표1 유무) | 날짜 |`
