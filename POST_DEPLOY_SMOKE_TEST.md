# 배포 후 5분 스모크 테스트

Netlify 배포가 끝나면 심사위원에게 URL을 보내기 전에 아래 순서대로 확인합니다.

## 1. 기본 접속

- 배포 URL을 시크릿 창 또는 새 브라우저에서 연다.
- 첫 화면에 `KHU-Weaver`가 보이는지 확인한다.
- 개발자 도구 Console에 빨간 오류가 반복해서 뜨지 않는지 확인한다.

## 2. 온보딩 흐름

- `시작하기`를 누른다.
- 전자공학과 또는 표시되는 학과를 선택한다.
- 입학연도를 하나 선택한다.
- 이수 과목 입력 단계까지 넘어가는지 확인한다.

## 3. OCR 기능

- 스크린샷 입력 방식을 선택한다.
- 개인 정보가 가려진 테스트용 성적 캡처 1장을 업로드한다.
- 분석이 시작되고, 인식 결과 화면이 표시되는지 확인한다.
- 전공 과목이 로드맵에 반영되는지 확인한다.

## 4. API 키 보호 확인

- 브라우저 개발자 도구 Network 탭에서 Gemini API 주소가 직접 호출되지 않는지 확인한다.
- 브라우저 요청은 `/api/ocr`로만 나가야 한다.
- 배포된 정적 파일의 `js/config.js`에서 `GEMINI_API_KEY`가 빈 문자열인지 확인한다.

## 5. 함수 상태 확인

- 배포 URL 뒤에 `/api/ocr`를 붙여 브라우저에서 열어본다.
- GET 요청은 `Method not allowed` 또는 비슷한 오류가 나와도 정상이다. OCR은 POST 요청으로만 동작한다.
- 터미널이나 외부 REST 클라이언트에서 Origin 없이 직접 호출하면 `Origin is not allowed`가 나올 수 있으며, 이것도 정상이다.
- 이미지가 없는 임의 POST 요청은 `OCR request must include...` 계열 오류가 나와야 정상이다.
- OCR 업로드 분석이 실패하면 Netlify Site settings -> Environment variables에서 `GEMINI_API_KEY`가 등록되어 있는지 먼저 확인한다.

## 6. 제출 문서 반영

- 최종 배포 URL을 `MIDTERM_PLAN_WEB_SECTION.md`의 `체험 URL` 자리에 넣는다.
- 중간계획서에는 API 키 보호 방식을 `Netlify Function 서버리스 프록시 + 환경변수`라고 적는다.
