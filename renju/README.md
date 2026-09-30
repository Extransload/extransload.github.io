# Playroom Renju Worker

정적 Astro 사이트의 `/playroom/`과 별도로 배포하는 실시간 대국 서버입니다. Cloudflare Durable Object 하나가 방 하나를 맡으며, 착수와 승패를 서버에서 판정하고 WebSocket으로 동기화합니다. 방과 기보는 Durable Object 저장소에 남습니다.

## 로컬 실행

프로젝트 루트에서 다음 명령 하나로 Astro와 Playroom Worker가 함께 실행됩니다. 최초 실행 시 Worker 의존성이 없으면 자동으로 설치합니다.

```bash
npm run dev
```

사이트만 실행하려면 다음 명령을 사용합니다. 이 경우 실시간 대국 생성은 동작하지 않습니다.

```bash
npm run dev:site
```

## 배포

```bash
cd renju
npm ci
npm run typecheck
npm run deploy
```

배포된 Worker의 HTTPS origin을 GitHub repository variable `PUBLIC_RENJU_API_URL`에 설정한 다음 공개 사이트를 다시 빌드합니다. Worker 배포와 Pages 배포는 별개입니다. 공유 링크에는 방 ID만 들어가며 플레이어 토큰은 각 브라우저의 localStorage에 보관합니다. 두 번째 접속자는 참여 버튼을 눌러 백 자리를 확정합니다.

이 대국은 중앙 첫 수와 흑 금수 판정을 사용하는 친선 대국형 렌주입니다. 공식 대회 오프닝 절차인 주형 선택과 색 교환은 제공하지 않습니다. 시간 제한도 현재 적용하지 않습니다.
