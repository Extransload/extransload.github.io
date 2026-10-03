export const STONES = ['classic', 'jade', 'slate', 'amber', 'rose', 'flower', 'heart'] as const;
export const AVATARS = ['classic', 'coral', 'mint', 'royal', 'sunflower', 'shadow'] as const;
export const ACCESSORIES = ['none', 'flower', 'leaf', 'crown', 'sun'] as const;
export const BOARDS = ['oak', 'walnut', 'linen', 'ink', 'meadow'] as const;
export const VICTORIES = ['dance', 'spin', 'bow', 'cheer'] as const;

export type StoneStyle = (typeof STONES)[number];
export type AvatarStyle = (typeof AVATARS)[number];
export type AccessoryStyle = (typeof ACCESSORIES)[number];
export type BoardStyle = (typeof BOARDS)[number];
export type VictoryStyle = (typeof VICTORIES)[number];
export type PlayerAppearance = {
  stone: StoneStyle;
  avatar: AvatarStyle;
  accessory: AccessoryStyle;
  victory: VictoryStyle;
};
export type Appearance = PlayerAppearance & { board: BoardStyle };

export const DEFAULT_APPEARANCE: Appearance = {
  stone: 'classic',
  avatar: 'classic',
  accessory: 'none',
  board: 'oak',
  victory: 'dance',
};

export function appearanceForSeat(
  seat: 'black' | 'white',
  mySeat: 'black' | 'white' | 'spectator' | null,
  selected: Appearance,
): PlayerAppearance {
  return seat === mySeat ? selected : DEFAULT_APPEARANCE;
}
export const APPEARANCE_STORAGE_KEY = 'omokmaru-appearance-v1';

export const APPEARANCE_OPTIONS = {
  stone: [
    { id: 'classic', name: '클래식', detail: '매끈하고 둥근 기본 돌', colors: ['#09131d', '#fff9ee'] },
    { id: 'jade', name: '팔각 비취', detail: '면이 반짝이는 팔각 보석', colors: ['#123b38', '#e8f4dc'] },
    { id: 'slate', name: '열두 각 먹돌', detail: '평평한 윗면과 각진 옆면', colors: ['#23272e', '#e5e3de'] },
    { id: 'amber', name: '호박 원석', detail: '울퉁불퉁한 원석의 윤곽', colors: ['#493018', '#fff1d2'] },
    { id: 'rose', name: '장미꽃', detail: '흑은 붉은 장미, 백은 노란 장미', colors: ['#b72f48', '#f0c84d'] },
    { id: 'flower', name: '꽃송이', detail: '진한 청록과 연한 민트 꽃잎', colors: ['#148b82', '#b2e6d0'] },
    { id: 'heart', name: '하트', detail: '짙은 베리와 연분홍 하트', colors: ['#ab368a', '#ffd0dc'] },
  ],
  avatar: [
    { id: 'classic', name: '마루', detail: '동글동글한 오목마루의 얼굴', colors: ['#182d3a', '#e4bd77'] },
    { id: 'coral', name: '장미 요정', detail: '꽃잎 치마와 꽃봉오리 머리의 요정', colors: ['#a6536c', '#eaa5a3'] },
    { id: 'mint', name: '버섯 꼬마', detail: '넓은 갓 아래 숨어 있는 숲 친구', colors: ['#3b6961', '#e6ce9e'] },
    { id: 'royal', name: '구름 고양이', detail: '구름 꼬리와 쫑긋한 귀를 가진 고양이', colors: ['#343e6a', '#e4c176'] },
    { id: 'sunflower', name: '노랑 병아리', detail: '작은 날개와 주황 부리의 병아리', colors: ['#e9ad48', '#ffdf80'] },
    {
      id: 'shadow',
      name: '달토끼',
      detail: '긴 귀와 초승달 배를 가진 토끼',
      colors: ['#66627f', '#aaa4c8'],
    },
  ],
  accessory: [
    { id: 'none', name: '장식 없음', detail: '깔끔한 기본 모습', colors: ['#8d9f9b', '#e8e8d6'] },
    { id: 'flower', name: '산호 꽃', detail: '귀 옆에 살짝 핀 작은 꽃', colors: ['#c36566', '#ffe1d0'] },
    { id: 'leaf', name: '민트 잎', detail: '머리 위에 돋아난 두 잎', colors: ['#58a592', '#dff3dc'] },
    { id: 'crown', name: '별 왕관', detail: '세 개의 반짝이는 봉우리', colors: ['#d9bb72', '#fff2b8'] },
    { id: 'sun', name: '해님', detail: '환한 꽃잎을 닮은 장식', colors: ['#efc45b', '#fff1b8'] },
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
    accessory: ACCESSORIES.includes(input.accessory as AccessoryStyle)
      ? input.accessory!
      : DEFAULT_APPEARANCE.accessory,
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
