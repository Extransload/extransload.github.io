export type PlayroomGame = {
  id: string;
  number: string;
  name: string;
  subtitle: string;
  description: string;
  href: string;
  meta: string[];
};

export const playroomGames: PlayroomGame[] = [
  {
    id: 'omokmaru',
    number: '01',
    name: '오목마루',
    subtitle: '돌 하나로 시작하는 대결',
    description: '입체 바둑판에서 실시간으로 겨루는 1:1 렌주 오목.',
    href: '/playroom/omokmaru/',
    meta: ['3D', '1:1', '실시간'],
  },
];
