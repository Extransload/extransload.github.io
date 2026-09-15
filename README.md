# extransload.github.io

브랜드 이전 후 직접 완료할 GitHub·OAuth·Google 설정은 [Extransload 이전 Runbook](EXTRANSLOAD-RUNBOOK.md)을 참고하세요. 코드 변경과 새 Cloudflare 리소스 준비 상태도 문서 첫 표에 정리되어 있습니다.

개인의 글과 시선을 한 권의 책처럼 탐험하는 개인 사이트입니다. Astro로 정적 사이트를 생성하며, 게시물은 `src/domains/blog/content/posts/{category}/{slug}.md`의 Markdown으로 관리합니다.

## 도메인 구조

사이트는 블로그를 최상위로 두지 않고, 서로 독립적인 공간으로 구성합니다.

| 도메인 | 진입 경로 | 역할 |
| --- | --- | --- |
| `main` | `/`, `/works/`, `/works/<slug>/`, `/about/` | 책 표지형 스플래시, 작업 기록과 사이트 소개 |
| `blog` | `/blog/` | 글, 카테고리, 태그, 검색, 댓글 |
| `games` | `/games/` | 게임과 인터랙티브한 실험 |

`/works/`는 작업의 목차이고, 프로젝트별 상세는 `/works/<slug>/`에 폴리오 한 장씩 둡니다. 목차는 서술을 담지 않고 각 폴리오로 보내는 역할만 합니다.

도메인별 구현은 `src/domains/` 아래에 두며, 도메인 중립적인 문서·테마·UI만 `src/shared/`에 둡니다. Astro의 파일 기반 라우팅을 위해 `src/pages/`에는 각 도메인을 연결하는 얇은 라우트 어댑터만 둡니다.

## 디자인 헤리티지

이 사이트의 최상위 디자인 원칙은 **그리스 신화와 서구 고서를 연상시키는 한 권의 책을 열고, 그 안의 여러 공간을 탐험하는 경험**입니다. 기존의 “서구적 에디토리얼 매거진”은 이 헤리티지를 표현하는 보조 문법이며, 상충할 때는 책과 탐험의 경험을 우선합니다.

- `/`는 책의 표지이자 입구이며, Blog·Works·Games·About은 책 안에서 발견하는 장 또는 공간으로 다룹니다.
- 표면은 평면 색상이나 일반적인 노이즈가 아니라 가죽·스웨이드·종이·직물처럼 재료가 식별되는 질감을 사용합니다.
- 기본 색감은 깊은 청색, 아이보리, 오래된 황동과 금박 계열을 중심으로 구성합니다.
- 그리스 신화, 고전 장정, 문장, 각인, 테두리 장식은 절제해서 사용하되 책 표지의 물성을 강화해야 합니다.
- UI는 SaaS 대시보드나 일반 블로그 템플릿처럼 보이지 않아야 하며, 페이지 전환과 탐색은 책을 열고 장을 넘기는 인상을 지향합니다.
- 사이드바와 코드 패널은 같은 재료 언어를 공유하되, 동일한 비트맵이나 패턴을 그대로 반복하지 않습니다.

## 로컬 개발

커밋된 lockfile과 동일한 의존성을 설치한 뒤 개발 서버를 실행합니다.

```bash
npm ci
npm run dev
```

프로덕션 빌드는 Astro 정적 사이트, RSS, sitemap, Pagefind 검색 색인을 모두 `dist/`에 생성합니다.

```bash
npm run build
```

검증 명령은 다음과 같습니다.

```bash
npm test -- --run
npm run test:e2e
```

## 댓글과 GA4 설정

다음 값은 브라우저에 공개되는 배포 설정이므로 GitHub repository variables에 등록합니다. 소스 코드나 GitHub Secrets에 넣지 않습니다.

| Variable | 용도 |
| --- | --- |
| `PUBLIC_GA_MEASUREMENT_ID` | GA4 Measurement ID. 비워 두면 분석 스크립트를 로드하지 않습니다. |
| `PUBLIC_COMMENTS_API_URL` | 댓글 Worker의 origin. 기본값은 기존 관리자 Worker 주소입니다. |
| `PUBLIC_ADMIN_URL` | 별도 관리자 Worker의 HTTPS 주소입니다. 비워 두면 `/admin/` 설정 안내가 표시됩니다. |

## 관리자 기반

`admin/`에는 본인 전용 관리자 UI와 Cloudflare Worker/D1의 초기 기반이 있습니다. `admin/wrangler.jsonc`의 D1 ID와 Worker secrets를 설정한 뒤 배포해야 로그인, 글 저장, GitHub 발행, GA4 및 Search Console 통계 API가 활성화됩니다. 현재 공개 Astro 빌드는 관리자 초안 본문을 포함하지 않으며 `/publication-manifest.json`에는 공개 글만 포함합니다.

댓글과 방명록은 Worker/D1에 저장합니다. GitHub 로그인은 필요 없으며 닉네임, 댓글별 비밀번호(4~128자), 공개 범위, 본문으로 등록합니다. 비공개 댓글은 비밀번호를 아는 사람만 내용을 볼 수 있고, 비밀번호를 아는 사람은 닉네임과 본문을 수정하거나 댓글을 삭제할 수 있습니다. 좋아요는 브라우저 식별자별로 등록·취소하며 실제 사람당 한 번을 보장하지 않습니다. 기존 Giscus 연결은 제거했습니다. 배포 순서와 비밀번호용 secret 설정은 `admin/COMMENTS.md`를 참고하세요.

## GitHub Pages 배포와 확인

`.github/workflows/deploy.yml`은 `main` push 또는 수동 실행에서 `npm ci`, `npm run build`, Pages artifact 업로드, GitHub Pages 배포를 순서대로 수행합니다. Build 단계는 repository variables를 `PUBLIC_*` 환경 변수로 전달하며, deploy job에만 `pages: write`와 `id-token: write` 권한을 부여합니다.

GitHub repository의 **Settings → Pages**에서 source를 **GitHub Actions**로 설정합니다. 배포 후 `https://extransload.github.io/`에서 다음을 확인합니다.

- `https://extransload.github.io/rss.xml`과 `https://extransload.github.io/sitemap-index.xml`이 열리는지
- `/robots.txt`, `/favicon.svg`, `pagefind/`가 빌드 산출물에 포함되는지
- 데스크톱/모바일 레이아웃, 테마 저장, 검색 결과 이동, TOC, 댓글 컨테이너와 방명록 경로가 정상인지
- 댓글 등록·수정·삭제·좋아요와 방명록이 운영 Worker에서 정상 처리되는지
