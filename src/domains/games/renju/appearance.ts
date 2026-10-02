export const STONES = ['classic', 'jade', 'slate', 'amber', 'rose'] as const;
export const AVATARS = ['classic', 'coral', 'mint', 'royal', 'sunflower'] as const;
export const ACCESSORIES = ['none', 'flower', 'leaf', 'crown', 'sun'] as const;
export const BOARDS = ['oak', 'walnut', 'linen', 'ink', 'meadow'] as const;
export const VICTORIES = ['dance', 'spin', 'bow', 'cheer'] as const;

export type StoneStyle = (typeof STONES)[number];
export type AvatarStyle = (typeof AVATARS)[number];
export type AccessoryStyle = (typeof ACCESSORIES)[number];
export type BoardStyle = (typeof BOARDS)[number];
export type VictoryStyle = (typeof VICTORIES)[number];
export type PublicAppearance = {
  stone: StoneStyle;
  avatar: AvatarStyle;
  accessory: AccessoryStyle;
  victory: VictoryStyle;
};
export type Appearance = PublicAppearance & { board: BoardStyle };

export const DEFAULT_APPEARANCE: Appearance = {
  stone: 'classic',
  avatar: 'classic',
  accessory: 'none',
  board: 'oak',
  victory: 'dance',
};
export const APPEARANCE_STORAGE_KEY = 'omokmaru-appearance-v1';

export const APPEARANCE_OPTIONS = {
  stone: [
    { id: 'classic', name: '클래식', detail: '깊은 흑과 부드러운 백의 기본 유광 돌', colors: ['#09131d', '#fff9ee'] },
    { id: 'jade', name: '비취', detail: '차분한 녹빛과 옥빛 백돌', colors: ['#123b38', '#e8f4dc'] },
    { id: 'slate', name: '먹돌', detail: '빛을 낮춘 무광 석재 질감', colors: ['#23272e', '#e5e3de'] },
    { id: 'amber', name: '호박', detail: '따뜻한 갈색과 크림빛 광택', colors: ['#493018', '#fff1d2'] },
    { id: 'rose', name: '장미', detail: '짙은 자주와 옅은 분홍의 조합', colors: ['#442433', '#ffe8ee'] },
  ],
  avatar: [
    { id: 'classic', name: '마루', detail: '오목마루의 익숙한 기본 색', colors: ['#182d3a', '#e4bd77'] },
    { id: 'coral', name: '산호', detail: '온기 있는 분홍빛 색', colors: ['#815160', '#f2bd89'] },
    { id: 'mint', name: '민트', detail: '시원한 숲빛 색', colors: ['#3b6961', '#e6ce9e'] },
    { id: 'royal', name: '남색', detail: '깊고 차분한 밤빛 색', colors: ['#343e6a', '#e4c176'] },
    { id: 'sunflower', name: '해바라기', detail: '밝고 따뜻한 노란빛 색', colors: ['#755534', '#efc45b'] },
  ],
  accessory: [
    { id: 'none', name: '장식 없음', detail: '깔끔한 기본 모습', colors: ['#8d9f9b', '#e8e8d6'] },
    { id: 'flower', name: '산호 꽃', detail: '귀 옆에 살짝 핀 작은 꽃', colors: ['#c36566', '#ffe1d0'] },
    { id: 'leaf', name: '민트 잎', detail: '머리 위에 돋아난 두 잎', colors: ['#58a592', '#dff3dc'] },
    { id: 'crown', name: '별 왕관', detail: '세 개의 반짝이는 봉우리', colors: ['#d9bb72', '#fff2b8'] },
    { id: 'sun', name: '해님', detail: '환한 꽃잎을 닮은 장식', colors: ['#efc45b', '#fff1b8'] },
  ],
  board: [
    { id: 'oak', name: '참나무', detail: '따뜻하고 익숙한 오목판', colors: ['#b98250', '#64472e'] },
    { id: 'walnut', name: '호두나무', detail: '차분한 갈색 나뭇결', colors: ['#997653', '#473627'] },
    { id: 'linen', name: '린넨', detail: '부드러운 회색빛 바탕', colors: ['#8e8b7d', '#464438'] },
    { id: 'ink', name: '먹빛', detail: '서늘한 청회색 바탕', colors: ['#7b8c96', '#3b4f5b'] },
    { id: 'meadow', name: '초원', detail: '풀빛이 감도는 산뜻한 바탕', colors: ['#87916d', '#4b5e38'] },
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

export function publicAppearance(value: unknown): PublicAppearance {
  const { stone, avatar, accessory, victory } = normalizeAppearance(value);
  return { stone, avatar, accessory, victory };
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
