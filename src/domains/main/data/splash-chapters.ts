export type ChapterId = 'journal' | 'works' | 'playroom' | 'about' | 'guestbook';

export interface SplashChapter {
  id: ChapterId;
  number: string;
  label: string;
  href: string;
  description: string;
  invitation: string;
  /** Measured opaque capital bounds and luminance deciles of the embroidery asset. */
  wordmark: {
    src: string;
    width: number;
    height: number;
    capHeight: number;
    capTop: number;
    luminance: readonly [number, number, number];
  };
}

export const splashChapters: SplashChapter[] = [
  {
    id: 'journal',
    number: '01',
    label: 'Journal',
    href: '/blog/',
    description: '읽고, 쓰고, 오래 남겨두고 싶은 것들.',
    invitation: '기록 펼치기',
    wordmark: {
      src: '/images/splash-journal-wordmark-v2.webp',
      width: 1120,
      height: 374,
      capHeight: 274,
      capTop: 60,
      luminance: [0.15208, 0.48183, 0.79116],
    },
  },
  {
    id: 'works',
    number: '02',
    label: 'Works',
    href: '/works/',
    description: '생각이 조금씩 형태를 얻는 곳.',
    invitation: '작업 살펴보기',
    wordmark: {
      src: '/images/splash-works-wordmark.webp',
      width: 560,
      height: 159,
      capHeight: 142,
      capTop: 10,
      luminance: [0.20668, 0.49793, 0.68092],
    },
  },
  {
    id: 'playroom',
    number: '03',
    label: 'Playroom',
    href: '/playroom/',
    description: '쓸모를 잠시 내려놓고, 호기심을 따라.',
    invitation: '놀러 가기',
    wordmark: {
      src: '/images/splash-playroom-wordmark-v2.webp',
      width: 1120,
      height: 374,
      capHeight: 200,
      capTop: 63,
      luminance: [0.15342, 0.4939, 0.82418],
    },
  },
  {
    id: 'about',
    number: '04',
    label: 'About',
    href: '/about/',
    description: '이 장서를 채워가는 사람에 관하여.',
    invitation: '조금 더 알아보기',
    wordmark: {
      src: '/images/splash-about-wordmark.webp',
      width: 560,
      height: 178,
      capHeight: 153,
      capTop: 13,
      luminance: [0.20553, 0.52145, 0.69488],
    },
  },
  {
    id: 'guestbook',
    number: '05',
    label: 'Guestbook',
    href: '/guestbook/',
    description: '다녀간 자리에는, 짧은 인사 한 줄.',
    invitation: '인사 남기기',
    wordmark: {
      src: '/images/splash-guestbook-wordmark-v2.webp',
      width: 1120,
      height: 374,
      capHeight: 190,
      capTop: 90,
      luminance: [0.16744, 0.47825, 0.79873],
    },
  },
];
