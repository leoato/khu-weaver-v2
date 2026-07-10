# KHU-Weaver v3 카카오 로그인 설정

## 구현 방식

KHU-Weaver는 정적 SPA와 Netlify Functions로 구성되어 있어 서버 측 카카오 REST OAuth Authorization Code 흐름을 사용합니다. 브라우저에는 카카오 액세스 토큰을 저장하지 않습니다. 로그인 완료 후 카카오 사용자 ID, 닉네임, 프로필 이미지 주소만 7일짜리 HttpOnly 서명 세션 쿠키에 보관합니다.

일반 `로그아웃`은 KHU-Weaver 세션만 종료합니다. 카카오 계정 연결 해제는 수행하지 않습니다.

## 카카오 Developers 설정

1. 카카오 Developers에서 v3용 애플리케이션을 만들거나 사용할 애플리케이션을 선택합니다.
2. 앱 설정의 플랫폼에서 Web 플랫폼을 등록합니다.
3. 사이트 도메인에 새 v3 Netlify 주소를 등록합니다.
4. 카카오 로그인 활성화 설정을 ON으로 바꿉니다.
5. Redirect URI에 아래 주소를 정확히 등록합니다.

```text
https://<V3_NETLIFY_DOMAIN>/api/auth/kakao/callback
```

Netlify 로컬 개발을 실제 카카오 앱과 연결할 경우 다음 주소도 별도로 등록합니다.

```text
http://localhost:8888/api/auth/kakao/callback
```

6. REST API 키를 `KAKAO_REST_API_KEY`로 사용합니다. JavaScript 키나 Admin 키를 사용하지 않습니다.
7. Client Secret을 생성하고 활성화한 뒤 `KAKAO_CLIENT_SECRET`에 넣습니다.
8. 동의 항목은 닉네임과 프로필 이미지만 권장합니다. 이메일은 이 앱에서 필수가 아니며 동의하지 않아도 로그인됩니다.
9. 현재 구현은 ID Token을 사용하지 않으므로 OpenID Connect 활성화가 필요하지 않습니다.

## Netlify 환경변수

새 v3 사이트의 Site configuration -> Environment variables에 다음을 설정합니다.

```dotenv
KAKAO_REST_API_KEY=<REST API 키>
KAKAO_CLIENT_SECRET=<활성화한 Client Secret>
KAKAO_REDIRECT_URI=https://<V3_NETLIFY_DOMAIN>/api/auth/kakao/callback
SESSION_SECRET=<32자 이상의 무작위 문자열>
```

기존 OCR 기능을 위해 다음 환경변수도 v3 사이트에 유지합니다.

```dotenv
GEMINI_API_KEY=<기존 Gemini API 키>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=<선택 사항>
```

환경변수를 추가하거나 변경한 뒤에는 새 Deploy를 실행해야 Functions에 반영됩니다.

## 동작 확인

1. v3 주소에서 `카카오로 로그인`을 누릅니다.
2. 카카오 동의 화면에서 취소했을 때 원래 화면으로 돌아오고 취소 안내가 보이는지 확인합니다.
3. 로그인 후 헤더에 카카오 닉네임과 프로필 이미지가 표시되는지 확인합니다.
4. 새로고침 후에도 로그인 상태가 유지되는지 확인합니다.
5. `로그아웃` 후 헤더가 로그인 버튼으로 돌아오는지 확인합니다.
6. 기존 온보딩, 로드맵, 성적 계산기, OCR이 로그인 여부와 무관하게 그대로 작동하는지 확인합니다.

## 오류 확인

- `KOE004`: 카카오 로그인이 활성화되지 않음
- `KOE006`: 등록한 Redirect URI와 요청 URI가 정확히 일치하지 않음
- `KOE008`: REST API 키가 아닌 다른 키를 사용함
- `KOE010`: 활성화된 Client Secret이 없거나 값이 다름
- `KOE101`: 앱 키가 잘못됨
- `KOE114`: 로그인 코드와 토큰 요청이 서로 다른 카카오 앱 키를 사용함

Redirect URI 오류를 해결하기 위해 검증을 완화하지 말고 카카오 Developers와 `KAKAO_REDIRECT_URI`의 값을 정확히 일치시킵니다.
