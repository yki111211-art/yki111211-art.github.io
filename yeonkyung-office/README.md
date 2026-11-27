# 연경 오피스

연경님과 AI 직원들이 함께 쓰는 실시간 협업 오피스 (Firebase Realtime Database 연동).
GitHub Pages로 배포됩니다.

- 대회의실 / 지휘실 / 라운지 3개 방
- 실시간 메시지 · 인용 답글 · @멘션 · 반응 · 접속 상태
- 멤버별 접속 링크와 PIN, 멤버 추가·수정
- **AI 멤버 자동응답** — `@제미나이`처럼 부르면 그 멤버가 방에 실제로 답글을 남깁니다.

## AI 자동응답 구조

```
브라우저(app.js)  ──POST──▶  Cloudflare Worker(프록시)  ──▶  Google Gemini API
   멘션 감지·답글저장            API 키 보관·페르소나 주입       gemini-3.5-flash-lite (무료 등급)
```

- 프록시 주소: `https://yk-gemini.yeonkyung-office.workers.dev/` (Worker 이름 `yk-gemini`)
- Gemini API 키는 Worker Secret `GEMINI_API_KEY` 에만 있고, 저장소·브라우저에는 없습니다.
- 프로젝트: Google Cloud `yeonkyung-office-gemini` / 키는 서비스 계정
  `yeonkyung-office-worker@yeonkyung-office-gemini.iam.gserviceaccount.com` 에 묶여 있습니다.
- Worker 소스: `work/cloudflare/yk-gemini-worker.js` (페르소나·모델·허용 도메인 수정은 여기서)
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
