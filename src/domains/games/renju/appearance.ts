export const STONES = ['rose'] as const;
export const AVATARS = ['petal', 'luna', 'apron', 'rose', 'serin'] as const;
export const BOARDS = ['oak', 'walnut', 'linen', 'ink', 'meadow'] as const;
export const DANCES = ['signature', 'encore'] as const;

export type StoneStyle = (typeof STONES)[number];
export type AvatarStyle = (typeof AVATARS)[number];
export type BoardStyle = (typeof BOARDS)[number];
export type DanceStyle = (typeof DANCES)[number];
export type PlayerAppearance = {
  stone: StoneStyle;
  avatar: AvatarStyle;
  dance: DanceStyle;
};
export type Appearance = Omit<PlayerAppearance, 'dance'> & {
  board: BoardStyle;
  dances: Record<AvatarStyle, DanceStyle>;
};

export const DEFAULT_DANCES: Record<AvatarStyle, DanceStyle> = {
  petal: 'signature',
  luna: 'signature',
  rose: 'signature',
  apron: 'signature',
  serin: 'signature',
};
export const DANCE_NAMES: Record<AvatarStyle, Record<DanceStyle, string>> = {
  petal: { signature: '꽃길 스텝', encore: '꽃잎 퍼레이드' },
  luna: { signature: '팝 웨이브', encore: '핑크 피날레' },
  rose: { signature: '노을 왈츠', encore: '저녁 별 스윙' },
  apron: { signature: '리본 스킵', encore: '앞치마 폴카' },
  serin: { signature: '나이트 그루브', encore: '문라이트 턴' },
};

export const DEFAULT_APPEARANCE: Appearance = {
  stone: 'rose',
  avatar: 'petal',
  board: 'oak',
  dances: { ...DEFAULT_DANCES },
};

export function appearanceForSeat(
  seat: 'black' | 'white',
  mySeat: 'black' | 'white' | 'spectator' | null,
  selected: Appearance,
): PlayerAppearance {
  return {
    stone: seat === mySeat ? selected.stone : DEFAULT_APPEARANCE.stone,
    avatar: selected.avatar,
    dance: selected.dances[selected.avatar],
  };
}
export function playerLook(selected: Appearance): PlayerAppearance {
  return { stone: selected.stone, avatar: selected.avatar, dance: selected.dances[selected.avatar] };
}

export function normalizePlayerAppearance(value: unknown): PlayerAppearance {
  const input = value && typeof value === 'object' ? (value as Partial<PlayerAppearance>) : {};
  const avatar = AVATARS.includes(input.avatar as AvatarStyle) ? input.avatar! : DEFAULT_APPEARANCE.avatar;
  return {
    stone: STONES.includes(input.stone as StoneStyle) ? input.stone! : DEFAULT_APPEARANCE.stone,
    avatar,
    dance: DANCES.includes(input.dance as DanceStyle) ? input.dance! : DEFAULT_DANCES[avatar],
  };
}
export const APPEARANCE_STORAGE_KEY = 'omokmaru-appearance-v1';

export const APPEARANCE_OPTIONS = {
  stone: [{ id: 'rose', name: '장미꽃', detail: '말린 꽃잎이 겹친 붉은·노란 장미', colors: ['#9c1028', '#edb72f'] }],
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
} as const;

export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? (value as Partial<Appearance>) : {};
  const storedDances = input.dances && typeof input.dances === 'object' ? input.dances : DEFAULT_DANCES;
  return {
    stone: STONES.includes(input.stone as StoneStyle) ? input.stone! : DEFAULT_APPEARANCE.stone,
    avatar: AVATARS.includes(input.avatar as AvatarStyle) ? input.avatar! : DEFAULT_APPEARANCE.avatar,
    board: BOARDS.includes(input.board as BoardStyle) ? input.board! : DEFAULT_APPEARANCE.board,
    dances: Object.fromEntries(
      AVATARS.map((avatar) => [
        avatar,
        DANCES.includes(storedDances[avatar] as DanceStyle) ? storedDances[avatar] : DEFAULT_DANCES[avatar],
      ]),
    ) as Record<AvatarStyle, DanceStyle>,
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
