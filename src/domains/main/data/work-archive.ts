export interface WorkMetric {
  label: string;
  value: string;
}

export interface WorkLink {
  label: string;
  href: string;
}

export interface WorkChapter {
  number: string;
  period: string;
  title: string;
  problem: string;
  work: string[];
  decision?: string;
  outcome: string;
  unverified?: boolean;
}

export interface WorkShot {
  src: string;
  alt: string;
  caption: string;
}

export interface WorkProject {
  slug: string;
  folio: string;
  title: string;
  subtitle: string;
  period: string;
  role: string;
  context: string;
  summary: string;
  metrics: WorkMetric[];
  stack: string;
  links: WorkLink[];
  diagram: 'citewell' | 'danchu' | 'degureure';
  gallery: WorkShot[];
  chapters: WorkChapter[];
}

export const works: WorkProject[] = [
  {
    slug: 'citewell',
    folio: 'Folio 01',
    title: 'CiteWell',
    subtitle: '의학 논문의 참고문헌을 검증하고 저널 형식으로 바꾸는 제품',
    period: '2023.12.11 — 현재',
    role: '풀스택 · 제품 개발',
    context: 'Research Factory',
    summary:
      '합류 시점의 서비스는 화면과 서버가 한 덩어리로 얽힌 JavaScript 코드였습니다. 그것을 Django와 Vue로 가르는 일에서 시작해, 논문 변환과 참고문헌 변환 두 개의 프로그램을 만들고, 제품이 참고문헌 검증으로 방향을 튼 뒤에는 결제와 검증 보고서까지 이어 왔습니다.',
    metrics: [
      { label: '기간', value: '2년 9개월' },
      { label: '작성 커밋', value: '3,233건' },
      { label: '특허 출원', value: '2건' },
    ],
    stack: 'Django · Django REST Framework · Vue · Redis · PostgreSQL · PyMuPDF · Tesseract · Paddle',
    links: [{ label: 'citewell.org', href: 'https://citewell.org/' }],
    diagram: 'citewell',
    gallery: [],
    chapters: [
      {
        number: '01',
        period: '2024.01 — 2024.02',
        title: '기반을 다시 세우다',
        problem:
          '서비스가 JavaScript 한 덩어리로 되어 있어 화면과 서버 로직의 경계가 없었습니다. 한 곳을 고치면 영향 범위를 예측할 수 없었고, 저널마다 다른 투고 규정 같은 복잡한 규칙을 그 위에 얹을 수 없는 상태였습니다.',
        work: [
          '단일 JavaScript 코드베이스를 Django 백엔드와 Vue 프론트엔드로 분리',
          'GraphQL 스키마를 걷어내고 REST API로 전환, Django 5.0.1 이관과 CSRF 처리 재정비',
          'JWT 인증을 별도 앱으로 분리하고 리프레시 토큰 모델과 재발급 API 구현',
          '식별자를 UUID로 전환, 커스텀 에러 코드 체계와 serializer 검증 도입',
          '뷰에 몰려 있던 비즈니스 로직을 분리하고 소유권 검증을 데코레이터로 공통화',
        ],
        decision:
          'Django REST Framework의 관례는 클래스형 뷰지만 함수형 뷰를 택했습니다. 요청이 어떤 검증을 거쳐 무엇을 반환하는지가 위에서 아래로 한 번에 읽히는 쪽이 낫다고 판단했고, 반복되는 처리는 데코레이터로 뽑아 중복을 막았습니다.',
        outcome:
          '서버와 화면의 책임이 갈라졌습니다. 이후 2년 넘게 더해진 모든 기능이 이때 그은 경계 위에 올라갔습니다.',
      },
      {
        number: '02',
        period: '2024.02 — 2025.03',
        title: '두 개의 변환기를 만들다',
        problem:
          '논문을 투고하려면 저널이 요구하는 형식을 따라야 합니다. 특히 참고문헌은 많게는 수백 개 항목을 저자명 표기 방식과 요소 순서까지 규정에 맞춰 손으로 고쳐야 했고, 그 과정에서 생긴 사소한 오류가 심사 단계의 수정 요청과 출판 지연으로 이어졌습니다.',
        work: [
          '참고문헌 변환 — PubMed 기반 검증과 Reference Template에 따른 저널별 형식 변환',
          '저자, 제목, 저널, 편집자, DOI 등 요소별 표현 방식 설정과 자유로운 배치 편집',
          '외부 compile API 의존을 내부 변환 엔진으로 대체하고 NBIB·RIS 상호 변환 구현',
          '논문 변환 지원 — Journal Template과 옵션 데이터를 다루는 편집기 구현',
          '옵션 구조가 바뀌어도 기존 템플릿을 새 구조로 옮기는 Template migration 시스템 구축',
        ],
        decision:
          'Journal Template은 백엔드의 옵션 데이터 구조가 곧 화면 렌더링을 결정하도록 설계했습니다. 저널 규정이 추가될 때 화면을 따로 만들지 않고 옵션 정의만 늘리면 되도록 한 선택입니다. 변환 함수도 템플릿 id 대신 옵션 값을 인자로 받게 바꿔 단위 테스트가 가능한 형태로 돌렸습니다.',
        outcome:
          '두 프로그램 모두 특허를 출원했습니다. 옵션 구조 변경에 대응하는 migration 모듈은 논문 변환 특허의 구성요소로 명세에 포함되었고, 별도로 KCL 소프트웨어 시험도 거쳤습니다.',
      },
      {
        number: '03',
        period: '2024.02 — 2024.08',
        title: '접근을 통제하다',
        problem:
          '변환 한 번에 AI 호출과 문서 파싱이 딸려 있어 호출을 무제한으로 열어 둘 수 없었습니다. 게다가 연구자 계정에는 아직 출판되지 않은 원고가 담기므로 비밀번호 하나로 지킬 수 있는 자산이 아니었습니다.',
        work: [
          '요청 제한을 미들웨어 단과 DRF 단 두 층으로 구현하고 별도 config 앱으로 분리',
          '이메일 인증과 재발송, 비밀번호 재설정까지 계정 흐름 전 구간 구현',
          '인증 완료 여부를 확인하는 permission을 추가해 미인증 계정의 기능 사용 차단',
          'pyotp와 Redis를 이용한 2단계 인증 구현 — 메일 OTP 발송, 만료 처리, 재발송',
          '프론트엔드 2차 인증 페이지와 코드 초기화 흐름 구현',
        ],
        decision:
          '요청 제한을 두 층으로 나눈 것은 미들웨어가 DRF에 닿기 전 모든 요청을 막고, DRF 스로틀이 인증 주체와 기능 범위별 한도를 따로 다루게 하기 위한 것으로 보입니다.',
        outcome:
          '외부 공개를 감당할 수 있는 계정 체계가 갖춰졌습니다. 여기서 만든 인증 층은 이후 ORCID 연동과 기업 계정 권한 관리의 토대가 되었습니다.',
        unverified: true,
      },
      {
        number: '04',
        period: '2025.03 — 2025.12',
        title: '방향을 틀다',
        problem:
          '논문 변환은 자동 분석과 태깅, 변환, 옵션 관리 세 시스템이 모두 정확해야 결과가 쓸 만해집니다. 반면 참고문헌 변환은 입력 범위가 좁고 검증 기준이 분명해 먼저 제품으로 설 수 있었습니다.',
        work: [
          'Reference Converter를 Bibliography Converter로 개명하고 논문 변환 작업 중단',
          '제품명을 CiteWell로 바꾸고 참고문헌 검증·변환에 역량 집중',
          'ORCID OAuth 연동과 권한 처리, Reference Order와 Reference Item 구조 분리',
          'PubMed와 Crossref 병렬 검증, 원문 비교 판단 흐름 구축',
          'Paddle 결제 도입 — 개인 구독, 기업 구독, 일회성 크레딧 결제',
        ],
        outcome:
          '제품이 하나의 일을 제대로 하는 쪽으로 좁혀졌습니다. 유료 결제 경로가 열리면서 B2B 계약으로 이어졌고, 이후로는 고객 이메일 피드백이 기능 우선순위를 정하는 기준이 되었습니다.',
      },
      {
        number: '05',
        period: '2026.01 — 2026.04',
        title: '보고서를 설계하다',
        problem:
          '검증 결과를 화면에서 확인하는 것만으로는 부족했습니다. 기관과 학회는 제출하고 보관할 수 있는 형태의 문서를 필요로 했습니다.',
        work: [
          'Verification Report의 최초 설계와 구현 — 작업 화면, 데이터 구조, 목록과 상세',
          '디자인 확정 이후 PDF parser를 맡아 PDF에서 본문과 참고문헌부를 분리 추출',
          '검색 가능한 PDF와 이미지 PDF를 구분하고 필요한 경우에만 OCR로 라우팅',
          '인용 번호와 문맥을 원문 위치에 매핑하고 철회 논문 정보를 함께 표시',
          'Enterprise 조직과 초대·승인, 조직별 사용량과 구독 기간 관리',
        ],
        outcome:
          '검증 결과가 제품 밖으로 나갈 수 있는 산출물이 되었습니다. 화면에서 끝나던 판단이 제출 가능한 문서로 바뀌면서 기업 고객이 쓸 수 있는 형태가 갖춰졌습니다.',
      },
      {
        number: '06',
        period: '2026.05 — 현재',
        title: '표현을 시스템으로 묶다',
        problem:
          '보고서가 사용자 화면, 샘플, 관리자 미리보기, Public API 결과 네 곳에서 따로 렌더링되면서 같은 데이터가 경로마다 다르게 보이기 시작했습니다.',
        work: [
          'ReportStyle 모델과 적용 대상 계약을 정의한 Report Design System 구축',
          '관리자 스타일 편집 화면과 샘플 보고서 미리보기 제공',
          'Public API의 작업·사용 그룹 대시보드와 HTML·PDF 산출물 버전 관리',
          '웹훅 라우팅과 전달 이력, amended 이벤트 처리',
          'API 키 만료와 권한, 크레딧 원장과 견적 기반 구매, 결제 복원력 확보',
        ],
        outcome:
          '네 경로가 같은 표현 계약을 공유하게 되어, 스타일을 한 곳에서 바꾸면 모든 산출물에 동일하게 반영됩니다.',
      },
    ],
  },
  {
    slug: 'danchu',
    folio: 'Folio 02',
    title: 'DANCHU',
    subtitle: '지난 24시간의 뉴스를 단어 추측 게임으로 바꾸는 서비스',
    period: '2023.08.21 — 2023.10.06',
    role: '아키텍처 설계 · 데이터 파이프라인 · 프론트엔드',
    context: '삼성 청년 SW 아카데미',
    summary:
      '시사에 익숙하지 않은 사람도 전날의 주요 뉴스를 자연스럽게 접하게 만들자는 발상에서 출발했습니다. 뉴스를 모아 단어로 쪼개고, 그날 가장 많이 언급된 단어를 문제로 내는 구조입니다.',
    metrics: [
      { label: '기간', value: '7주' },
      { label: '역할', value: '설계 주도' },
      { label: '팀', value: 'SSAFY 자율 프로젝트' },
    ],
    stack: 'Python · React · 분산 처리 · 크롤링 스케줄러',
    links: [],
    diagram: 'danchu',
    gallery: [
      {
        src: '/images/works/danchu-play.webp',
        alt: '오늘의 단추 게임 화면. 뉴스 제목에서 핵심 단어가 빈칸으로 가려져 있고 아래에 추측 입력창과 시도 기록이 있다.',
        caption: '그날의 뉴스 제목에서 핵심 단어를 가리고, 추측할 때마다 근접도를 기록으로 남긴다',
      },
      {
        src: '/images/works/danchu-result.webp',
        alt: '문제를 모두 맞혔을 때 나타나는 축하 화면. 시도 횟수와 걸린 시간, 결과 복사와 관련 뉴스 버튼이 있다.',
        caption: '정답 이후 관련 뉴스로 이어지게 해, 게임이 끝나는 자리에서 시사로 넘어가게 했다',
      },
      {
        src: '/images/works/danchu-scheduler.webp',
        alt: '수집 스케줄러를 제어하는 API 목록 화면. scheduling과 collection 그룹으로 나뉜 엔드포인트가 나열되어 있다.',
        caption: '수집 파이프라인을 직접 조작할 수 있도록 스케줄러 제어 API를 따로 두었다',
      },
    ],
    chapters: [
      {
        number: '01',
        period: '2023.08 — 2023.10',
        title: '뉴스를 문제로 바꾸는 파이프라인',
        problem:
          '매일 쏟아지는 뉴스에서 그날을 대표하는 단어를 뽑아내야 했습니다. 단순히 많이 나온 단어를 세면 인명과 지명 같은 고유명사가 상위를 독점해 추측 게임으로 성립하지 않았습니다.',
        work: [
          '프로젝트 아키텍처 설계와 서비스 진행 플로우 구성 주도',
          '뉴스 기사 수집 파이프라인 구축과 자동화 스케줄러 구현',
          '기사 본문에서 고유명사를 제외한 명사만 추출',
          '분산 처리를 통한 워드 카운팅으로 당일 문제 단어 선정',
          '게임 종료 후 결과 화면과 관련 뉴스 추천 구현',
        ],
        outcome:
          '수집부터 문제 출제까지 사람 손이 닿지 않는 하루 단위 자동 흐름이 완성되었습니다. 결과 화면에서 정답 단어와 관련된 실제 기사를 이어 붙여, 게임이 끝난 뒤 시사 정보로 넘어가게 했습니다.',
      },
    ],
  },
  {
    slug: 'degureure',
    folio: 'Folio 03',
    title: '데구르르',
    subtitle: '1:1 웃음 참기 화상 대결',
    period: '2023.07.10 — 2023.11.17',
    role: '모델 서버 · 실시간 통신 · 프론트엔드 · 인프라',
    context: '삼성 청년 SW 아카데미',
    summary:
      '공격과 방어를 번갈아 진행하며 상대를 웃기는 실시간 화상 게임입니다. 카메라로 들어오는 얼굴에서 표정을 읽어 웃음 여부를 판정해야 했고, 그 판정이 대결 중간에 끊기지 않아야 했습니다.',
    metrics: [
      { label: '기간', value: '12주 · 2개 차수' },
      { label: '역할', value: '백엔드 · 프론트 · 인프라' },
      { label: '팀', value: 'SSAFY 공통 프로젝트' },
    ],
    stack: 'Python · FastAPI · Java · STOMP · WebSocket · React · Docker · Jenkins',
    links: [],
    diagram: 'degureure',
    gallery: [
      {
        src: '/images/works/degureure-architecture.webp',
        alt: '데구르르 서비스 아키텍처 다이어그램. 사용자에서 Next 프론트엔드를 거쳐 Spring 메인 서버로, 다시 Redis, MySQL, OpenVidu, FastAPI 모델 서버로 연결된다.',
        caption: '실제 서비스 아키텍처. 오른쪽 아래 FastAPI가 얼굴 인식과 표정 분석을 맡은 별도 서버다',
      },
      {
        src: '/images/works/degureure-flow.webp',
        alt: '게임 진행 흐름도. 공격과 수비 표시에서 시작해 웃음 게이지와 얼굴 인식 여부로 갈라진다.',
        caption: '공격과 수비를 번갈아 두고, 웃음 게이지와 얼굴 인식 결과로 판정이 갈린다',
      },
      {
        src: '/images/works/degureure-lobby.webp',
        alt: '데구르르 로비 화면. 방 만들기, 방 찾기, 랜덤 매칭 세 개의 버튼이 있다.',
        caption: '지인과 붙는 방 코드 입장과 ELO 기반 랜덤 매칭을 함께 두었다',
      },
    ],
    chapters: [
      {
        number: '01',
        period: '2023.07 — 2023.08',
        title: '표정 판정을 실시간 대결에 얹다',
        problem:
          '얼굴 인식과 표정 분석 모델은 Python으로 돌려야 했지만 게임 로직과 세션 관리는 Java 메인 서버에 있었습니다. 두 서버 사이로 영상 프레임이 지연 없이 오가야 대결이 성립했습니다.',
        work: [
          '얼굴 인식과 표정 분석 모델을 FastAPI 서버로 구축해 서빙',
          'Java 메인 서버와 Python 서버 사이의 이미지 전송을 웹소켓으로 구현',
          'STOMP를 이용해 대결 진행 상황을 실시간으로 주고받도록 연결',
          '클라이언트에서 직접 이미지를 받는 웹소켓 경로 추가',
          'Jenkins 빌드를 위한 Docker 이미지 구성',
        ],
        decision:
          '모델 추론이 메인 서버의 게임 로직과 자원을 나눠 쓰면 판정이 밀렸습니다. Python 서버를 별도 클라우드 서버로 분리 배포해 추론 부하를 떼어 냈습니다.',
        outcome:
          '표정 판정이 대결 흐름을 끊지 않을 만큼 따라왔고, 패배자 하이라이트 이미지를 남기는 기능까지 얹을 수 있었습니다.',
      },
      {
        number: '02',
        period: '2023.10 — 2023.11',
        title: '이탈한 자리를 메우다',
        problem:
          '마무리를 1주 남기고 프론트엔드 담당자가 개인 사정으로 팀을 떠났습니다. 게임의 핵심 화면 세 개가 완성되지 않은 상태였습니다.',
        work: [
          '게임 대기, 매칭, 플레이 화면의 UI 설계와 구현을 단독으로 담당',
          '하이라이트 기능과 이미지 업로드 구현',
          '튜토리얼 화면 디자인',
          '협업 문서 공간 구성과 관리',
        ],
        outcome:
          '남은 기간 안에 세 화면을 마무리해 프로젝트를 완주했습니다. 맡은 영역 바깥이라도 프로젝트가 멈추지 않게 하는 것이 먼저라는 판단이었고, 이후 2차 차수까지 6주를 더 이어 갔습니다.',
      },
    ],
  },
];

export const patents = [
  {
    title: 'AI 및 프로그램을 통한 논문 구조 자동 분석 및 태깅과 변환 시스템 및 방법',
    scope: '논문 변환',
    note: '자동 분석·태깅 시스템, 변환 시스템, 옵션 관리 시스템으로 구성',
  },
  {
    title: '서지 정보 구조 자동 분석 및 형식 변경 방법',
    scope: '참고문헌 변환',
    note: '다단계 검증과 AI 분석을 거쳐 저널별 템플릿으로 형식 변환',
  },
];
