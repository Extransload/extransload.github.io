export type ChapterId = 'journal' | 'works' | 'playroom' | 'about' | 'guestbook';

export interface SplashChapter {
  id: ChapterId;
  number: string;
  label: string;
  href: string;
  description: string;
  invitation: string;
}

export const splashChapters: SplashChapter[] = [
  {
    id: 'journal',
    number: '01',
    label: 'Journal',
    href: '/blog/',
    description: '읽고, 쓰고, 오래 남겨두고 싶은 것들.',
    invitation: '기록 펼치기',
  },
  {
    id: 'works',
    number: '02',
    label: 'Works',
    href: '/works/',
    description: '생각이 조금씩 형태를 얻는 곳.',
    invitation: '작업 살펴보기',
  },
  {
    id: 'playroom',
    number: '03',
    label: 'Playroom',
    href: '/playroom/',
    description: '쓸모를 잠시 내려놓고, 호기심을 따라.',
    invitation: '놀러 가기',
  },
  {
    id: 'about',
    number: '04',
    label: 'About',
    href: '/about/',
    description: '이 장서를 채워가는 사람에 관하여.',
    invitation: '조금 더 알아보기',
  },
  {
    id: 'guestbook',
    number: '05',
    label: 'Guestbook',
    href: '/guestbook/',
    description: '다녀간 자리에는, 짧은 인사 한 줄.',
    invitation: '인사 남기기',
  },
];
