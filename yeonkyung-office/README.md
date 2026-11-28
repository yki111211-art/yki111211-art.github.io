# 연경 오피스

연경님과 AI 직원들이 함께 쓰는 실시간 협업 오피스 (Firebase Realtime Database 연동).
GitHub Pages로 배포됩니다.

- 대회의실 / 지휘실 / 라운지 3개 방
- 실시간 메시지 · 인용 답글 · @멘션 · 반응 · 접속 상태
- 멤버별 접속 링크와 PIN, 멤버 추가·수정
- **AI 멤버 자동응답** — `@제미나이`처럼 부르면 그 멤버가 방에 실제로 답글을 남깁니다.

## AI 자동응답 구조

```
브라우저(app.v26.js)  ──POST──▶  Google Apps Script(프록시)  ──▶  Google Gemini API
   멘션 감지·답글저장               API 키 보관·페르소나 주입        gemini-3.5-flash-lite (무료 등급)
```

- 프록시 주소(v26): `https://script.google.com/macros/s/AKfycby0qVEli88-lbeHjvbs9eRhdhiOHNXd8GKs8AStmuPJONqIfB43x4jljLtTNo4ylbMr/exec`
  (Google Apps Script 프로젝트 `yeonkyung-office-proxy`, scriptId `1fFB04VvLoKTXKXClU91Qb5UbOVIm2GvyhM5_v5O1jAUmJfponZQk4ert`, 배포 v4, 액세스 "모든 사용자")
  - v25 이전에는 Cloudflare Worker `https://yk-gemini.yeonkyung-office.workers.dev/` 를 썼지만,
    **베트남 통신사 망에서 `workers.dev` 가 차단**되어 `script.google.com` 으로 옮겼습니다.
  - Apps Script 는 CORS preflight(OPTIONS)를 받지 않으므로, 앱은 `Content-Type: text/plain;charset=UTF-8` 로 POST합니다.
- Gemini API 키는 Apps Script 스크립트 속성 `GEMINI_API_KEY` 에만 있고, 저장소·브라우저에는 없습니다.
- 프로젝트: Google Cloud `yeonkyung-office-gemini` / 키는 서비스 계정
  `yeonkyung-office-worker@yeonkyung-office-gemini.iam.gserviceaccount.com` 에 묶여 있습니다.
- 프록시 소스: `work/gas-proxy/Code.gs` (Apps Script에 붙여 넣는 본문. 페르소나·모델 수정은 여기서)
- 예전 Cloudflare Worker 소스: `work/cloudflare/yk-gemini-worker.js` (v25까지 사용)
- 작동 방식
  - 사람이 보낸 메시지에서 AI 멤버 이름(`@제미나이`, `혀니야` 등)을 찾으면, 그 멤버 이름으로
    "입력 중…" 표시 후 최근 대화 12개를 Worker 에 보내 답글을 받아 인용 답글로 저장합니다.
  - AI 답글에는 `auto: true` 가 붙고 "자동응답" 표시가 보이며, 이 답글은 다시 AI를 부르지 않습니다.
  - AI 이름으로 로그인한 화면에서는 자동응답이 돌지 않습니다.
  - 한 메시지에 최대 2명까지만 답합니다(비용·소음 방지).
- 현재는 모든 AI 멤버가 무료 Gemini 엔진 하나를 공유하고, 이름·역할·말투(system instruction)만
  각자 다릅니다. 나중에 각 서비스의 유료 키를 붙이면 멤버별 모델로 바꿀 수 있습니다.

## 배포 메모

- `index.html` 의 `styles.css?v=`, `app.js?v=` 숫자를 올려야 브라우저 캐시가 갱신됩니다.
- GitHub Pages 는 HTML 을 몇 분간 캐시하므로, 배포 직후에는 새로고침을 한 번 해야 합니다.
- v26부터는 파일명에 버전을 넣습니다(`styles.v26.css`, `app.v26.js`) — 캐시 꼬임 방지.

## v21 기능 요약

- **@all / @전체** — AI 7명 전원이 0.6초 간격으로 차례로 답글을 남깁니다(429 방지, 선점 `claims/` 로 다중 탭 중복 방지).
- **멘션 없는 메시지** — 기본 비서 `혀니`가 답합니다(답글 대상이 AI면 그 AI).
- **사진·파일 첨부** — 📎 버튼 / 붙여넣기 / 끌어놓기. 이미지는 canvas로 1280px·품질 0.8 JPEG 압축 후
  Realtime Database `files/<id>/data`(data URL)에 저장, 메시지에는 메타만 넣습니다. 말풍선 썸네일 → 라이트박스,
  파일 카드는 다운로드 버튼. 새로고침·다른 기기에서도 그대로 열립니다. 일반 파일 2MB 제한.
- **사진 인식** — 메시지에 사진이 있으면 Worker가 Gemini에 `inlineData`로 함께 전달(최대 2장).
- **섹션 탭** — 💬 회의실(기존 3개 방) · 📋 작업실(`tasks/`) · 📊 비서현황 · 📝 메모(`memos/`).
- **비서 톤** — 지시를 받으면 "네, 대표님. 알겠습니다, 진행하겠습니다"로 받고 핵심을 이어서 말합니다.
- 배포: `work/pages-repo`(클론)에서 `yeonkyung-office/` 파일을 고쳐 commit·push 하면 한 번에 반영됩니다.
