export const STONES = [
  'classic',
  'jade',
  'rose',
  'chick',
  'puppy',
  'kitten',
  'bunny',
  'fox',
  'panda',
  'frog',
  'owl',
  'star',
  'dragon',
] as const;
export const AVATARS = ['petal', 'luna', 'apron', 'rose', 'serin'] as const;
export const BOARDS = ['oak', 'walnut', 'linen', 'ink', 'meadow'] as const;
export const VICTORIES = ['dance', 'spin', 'bow', 'cheer'] as const;

export type StoneStyle = (typeof STONES)[number];
export type AvatarStyle = (typeof AVATARS)[number];
export type BoardStyle = (typeof BOARDS)[number];
export type VictoryStyle = (typeof VICTORIES)[number];
export type PlayerAppearance = {
  stone: StoneStyle;
  avatar: AvatarStyle;
  victory: VictoryStyle;
};
export type Appearance = PlayerAppearance & { board: BoardStyle };

export const DEFAULT_APPEARANCE: Appearance = {
  stone: 'classic',
  avatar: 'petal',
  board: 'oak',
  victory: 'dance',
};

export function appearanceForSeat(
  seat: 'black' | 'white',
  mySeat: 'black' | 'white' | 'spectator' | null,
  selected: Appearance,
): PlayerAppearance {
  return { ...(seat === mySeat ? selected : DEFAULT_APPEARANCE), avatar: selected.avatar };
}
export const APPEARANCE_STORAGE_KEY = 'omokmaru-appearance-v1';

export const APPEARANCE_OPTIONS = {
  stone: [
    { id: 'classic', name: '클래식', detail: '매끈하고 둥근 기본 돌', colors: ['#09131d', '#fff9ee'] },
    { id: 'jade', name: '팔각 비취', detail: '면이 반짝이는 팔각 보석', colors: ['#123b38', '#e8f4dc'] },
    { id: 'rose', name: '장미꽃', detail: '말린 꽃잎이 겹친 붉은·노란 장미', colors: ['#9c1028', '#edb72f'] },
    { id: 'chick', name: '병아리 얼굴', detail: '도톰한 볼과 입체 부리', colors: ['#d18b2d', '#ffe9a3'] },
    { id: 'puppy', name: '강아지 얼굴', detail: '처진 귀와 통통한 주둥이', colors: ['#83553f', '#e9c9a5'] },
    { id: 'kitten', name: '고양이 얼굴', detail: '뾰족한 귀와 작은 수염', colors: ['#545578', '#e6ddef'] },
    { id: 'bunny', name: '토끼 얼굴', detail: '길게 솟은 귀와 분홍 코', colors: ['#9474a4', '#f7e5f0'] },
    { id: 'fox', name: '여우 얼굴', detail: '각진 얼굴과 뾰족한 귀', colors: ['#bd5a34', '#f4c999'] },
    { id: 'panda', name: '판다 얼굴', detail: '둥근 귀와 눈 주위 무늬', colors: ['#35434b', '#f8f4e9'] },
    { id: 'frog', name: '개구리 얼굴', detail: '튀어나온 두 눈과 큰 미소', colors: ['#277b5c', '#b7e6a3'] },
    { id: 'owl', name: '올빼미 얼굴', detail: '큰 두 눈과 작은 부리', colors: ['#655074', '#ddcfe2'] },
    { id: 'star', name: '별의 핵', detail: '다섯 갈래 별 속의 보석', colors: ['#3859a7', '#bad6f8'] },
    { id: 'dragon', name: '용의 알', detail: '뿔과 빛나는 보석이 있는 알', colors: ['#2b6d69', '#bbe3d3'] },
  ],
  avatar: [
    { id: 'petal', name: '페탈', detail: '꽃 자수 드레스 · 미소와 손짓으로 인사', colors: ['#c78782', '#fff0d8'] },
    {
      id: 'luna',
      name: '루나',
      detail: '분홍빛 머리와 로즈 드레스의 성인 캐릭터',
      colors: ['#d990ac', '#f1c7cc'],
    },
    { id: 'apron', name: '밀리', detail: '금발 올림머리와 밝은색 앞치마 드레스', colors: ['#eebd69', '#d7ba91'] },
    {
      id: 'serin',
      name: '세린',
      detail: '성숙한 비율의 짙은 갈색 머리와 남색 미니스커트',
      colors: ['#49342f', '#35495f'],
    },
  ],
  board: [
    { id: 'oak', name: '참나무', detail: '단정한 클래식 나무판', colors: ['#b98250', '#64472e'] },
    { id: 'walnut', name: '호두나무', detail: '돌출된 네 줄의 테두리', colors: ['#997653', '#473627'] },
    { id: 'linen', name: '린넨', detail: '가장자리를 따라 박음질한 판', colors: ['#8e8b7d', '#464438'] },
    { id: 'ink', name: '먹빛', detail: '네 귀퉁이에 금속판을 단 판', colors: ['#7b8c96', '#3b4f5b'] },
    { id: 'meadow', name: '초원', detail: '네 귀퉁이에 잎이 놓인 판', colors: ['#87916d', '#4b5e38'] },
  ],
  victory: [
    { id: 'dance', name: '신나는 춤', detail: '통통 뛰며 두 팔을 흔듭니다', colors: ['#d6aa63', '#f8e8be'] },
    { id: 'spin', name: '빙글 회전', detail: '한 바퀴 돌며 승리를 즐깁니다', colors: ['#829faf', '#dbeaf0'] },
    { id: 'bow', name: '예의 바른 인사', detail: '상대에게 고개를 숙여 인사합니다', colors: ['#8eaa90', '#e1eedf'] },
    { id: 'cheer', name: '만세!', detail: '두 팔을 번쩍 들고 환호합니다', colors: ['#c98c7a', '#f6d4be'] },
  ],
} as const;

export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? (value as Partial<Appearance>) : {};
  return {
    stone: STONES.includes(input.stone as StoneStyle) ? input.stone! : DEFAULT_APPEARANCE.stone,
    avatar: AVATARS.includes(input.avatar as AvatarStyle) ? input.avatar! : DEFAULT_APPEARANCE.avatar,
    board: BOARDS.includes(input.board as BoardStyle) ? input.board! : DEFAULT_APPEARANCE.board,
    victory: VICTORIES.includes(input.victory as VictoryStyle) ? input.victory! : DEFAULT_APPEARANCE.victory,
  };
}

export function loadAppearance(): Appearance {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(value: Appearance) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function watchAppearance(onChange: (appearance: Appearance) => void) {
  onChange(loadAppearance());
  const update = (event: StorageEvent) => {
    if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) onChange(loadAppearance());
  };
  window.addEventListener('storage', update);
  return () => window.removeEventListener('storage', update);
}
