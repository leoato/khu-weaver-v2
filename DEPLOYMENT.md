# KHU-Weaver v2 배포 안내

## 추천 방식: Netlify

이 프로젝트는 정적 웹앱이지만, OCR 분석에는 Gemini API 키가 필요합니다. 키를 숨기려면 브라우저가 Gemini를 직접 호출하면 안 되고, Netlify Function 같은 작은 서버 프록시가 대신 호출해야 합니다.

이미 다음 구성이 들어 있습니다.

- `netlify.toml`: `/api/ocr` 요청을 Netlify Function으로 연결
- `netlify/functions/ocr.js`: `GEMINI_API_KEY` 환경변수로 Gemini 호출
- `js/config.js`: 브라우저는 기본적으로 `/api/ocr`을 사용

## 배포 절차

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Netlify에서 `Add new site` -> `Import an existing project`로 저장소를 연결합니다.
3. Build command는 비워두고, Publish directory는 `.`로 둡니다.
4. 사이트 설정의 Environment variables에 `GEMINI_API_KEY`를 추가합니다.
5. 필요하면 `GEMINI_MODEL`도 추가합니다. 기본값은 `gemini-2.5-flash`입니다.
6. 배포된 주소에서 온보딩의 스크린샷 업로드 분석을 테스트합니다.

## Netlify Drop만 쓸 때의 주의점

Netlify Drop은 빠르게 폴더를 끌어다 배포할 수 있지만, 수동 배포는 빌드 명령을 실행하지 않는 방식입니다. OCR까지 심사위원이 직접 써보게 하려면 함수와 환경변수 관리가 안정적인 Git 연결 배포를 추천합니다.

## GitHub Pages는 왜 비추천인가요?

GitHub Pages는 정적 호스팅만 제공합니다. `config.js`에 키를 넣으면 방문자가 개발자 도구에서 키를 볼 수 있고, 별도 백엔드 없이는 숨길 수 없습니다. GitHub Pages를 꼭 쓰려면 Netlify Function, Vercel Function, Cloudflare Worker 같은 별도 프록시가 추가로 필요합니다.

## 공식 문서 근거

- Netlify Functions는 프로젝트 안의 서버 측 코드를 이벤트 요청에 따라 실행합니다: https://docs.netlify.com/build/functions/overview/
- Netlify 환경변수는 UI/CLI/API에 저장할 수 있고, Functions 범위에서 API 키 같은 민감값을 사용할 수 있습니다: https://docs.netlify.com/build/environment-variables/overview/
- Netlify 수동 Drag and Drop 배포는 빌드 명령을 실행하지 않습니다: https://docs.netlify.com/deploy/create-deploys/
- GitHub Pages는 HTML, CSS, JavaScript를 게시하는 정적 사이트 호스팅입니다: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

## 제출용으로 적기 좋은 문장

프로토타입은 웹으로 배포하고, 성적표 스크린샷 분석 기능은 서버리스 프록시를 통해 Gemini API를 호출하도록 구성했습니다. API 키는 클라이언트 코드에 포함하지 않고 배포 플랫폼의 환경변수에 저장하여 심사위원이 기능을 체험하더라도 키가 노출되지 않도록 했습니다.
