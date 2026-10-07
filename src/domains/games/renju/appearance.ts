export const TIERS = ['C', 'B', 'A', 'A+', 'S', 'S+'] as const;
export type Tier = (typeof TIERS)[number];
export const STONES = ['classic', 'rose', 'obsidian', 'opal', 'astral', 'sovereign'] as const;
// The legacy rose ID remains valid on the wire; local and incoming selections migrate to Luna.
export const AVATARS = ['petal', 'luna', 'apron', 'rose', 'serin', 'sylvie', 'astra', 'seraphine', 'aurelia'] as const;
export const BOARDS = [
  'wood',
  'oak',
  'walnut',
  'linen',
  'ink',
  'meadow',
  'marble',
  'moonstone',
  'celestial',
  'imperial',
] as const;
export const DANCES = ['signature', 'encore', 'ribbon', 'waltz', 'moonwalk', 'constellation', 'apotheosis'] as const;

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

export const AVATAR_TIERS: Record<AvatarStyle, Tier> = {
  petal: 'C',
  luna: 'A+',
  apron: 'A',
  rose: 'A',
  serin: 'A',
  sylvie: 'B',
  astra: 'S',
  seraphine: 'S+',
  aurelia: 'S+',
};
export const DEFAULT_DANCES = Object.fromEntries(AVATARS.map((avatar) => [avatar, 'signature'])) as Record<
  AvatarStyle,
  DanceStyle
>;
export const MOTION_NAMES: Record<DanceStyle, string> = {
  signature: '시그니처',
  encore: '앙코르',
  ribbon: '리본 스텝',
  waltz: '로열 왈츠',
  moonwalk: '달빛 턴',
  constellation: '별자리 무도',
  apotheosis: '천상의 피날레',
};
const danceNames = (signature: string, encore: string): Record<DanceStyle, string> => ({
  ...MOTION_NAMES,
  signature,
  encore,
});
export const DANCE_NAMES: Record<AvatarStyle, Record<DanceStyle, string>> = {
  petal: danceNames('꽃길 스텝', '꽃잎 퍼레이드'),
  luna: danceNames('팝 웨이브', '핑크 피날레'),
  rose: danceNames('노을 왈츠', '저녁 별 스윙'),
  apron: danceNames('클래식 스텝', '로열 턴'),
  serin: danceNames('나이트 그루브', '문라이트 턴'),
  sylvie: danceNames('숲길 스텝', '초록빛 인사'),
  astra: danceNames('별빛 스텝', '밤하늘 인사'),
  seraphine: danceNames('새벽 스텝', '여명의 인사'),
  aurelia: danceNames('햇살 스텝', '황금빛 인사'),
};

export const DEFAULT_APPEARANCE: Appearance = {
  stone: 'classic',
  avatar: 'petal',
  board: 'wood',
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

function normalizeAvatar(avatar: unknown): AvatarStyle {
  if (avatar === 'rose') return 'luna';
  return AVATARS.includes(avatar as AvatarStyle) ? (avatar as AvatarStyle) : DEFAULT_APPEARANCE.avatar;
}

export function normalizePlayerAppearance(value: unknown): PlayerAppearance {
  const input = value && typeof value === 'object' ? (value as Partial<PlayerAppearance>) : {};
  const avatar = normalizeAvatar(input.avatar);
  return {
    stone: STONES.includes(input.stone as StoneStyle) ? input.stone! : DEFAULT_APPEARANCE.stone,
    avatar,
    dance: DANCES.includes(input.dance as DanceStyle) ? input.dance! : DEFAULT_DANCES[avatar],
  };
}
export const APPEARANCE_STORAGE_KEY = 'omokmaru-appearance-v1';

export const APPEARANCE_OPTIONS = {
  stone: [
    {
      id: 'classic',
      name: '기본 흑백',
      tier: 'C',
      collection: 'original',
      detail: '단정한 검은 돌과 흰 돌',
      colors: ['#17191d', '#f4f2ed'],
    },
    {
      id: 'rose',
      name: '장미 송이',
      tier: 'B',
      collection: 'original',
      detail: '말린 꽃잎이 겹겹이 피어난 한 송이 장미',
      colors: ['#681934', '#f7c4d2'],
    },
    {
      id: 'obsidian',
      name: '소라',
      tier: 'A',
      collection: 'tier',
      detail: '작은 입구까지 이어지는 나선형 소라 껍질',
      colors: ['#242a36', '#f6e8d8'],
    },
    {
      id: 'opal',
      name: '연꽃',
      tier: 'A+',
      collection: 'tier',
      detail: '뾰족한 꽃잎과 연밥이 낮게 펼쳐진 연꽃',
      colors: ['#163a38', '#eaf7f4'],
    },
    {
      id: 'astral',
      name: '성운',
      tier: 'S',
      collection: 'tier',
      detail: '깊은 우주빛 속에서 흐르는 별의 고리',
      colors: ['#222d69', '#b7e6f4'],
    },
    {
      id: 'sovereign',
      name: '불꽃',
      tier: 'S+',
      collection: 'tier',
      detail: '세 갈래로 솟는 붉은 불꽃과 푸른 불꽃 · 흩날리는 불티',
      colors: ['#ed4222', '#239cff'],
    },
  ],
  avatar: [
    {
      id: 'petal',
      name: '페탈',
      tier: 'C',
      collection: 'original',
      detail: '꽃 자수 드레스 · 미소와 손짓으로 인사',
      colors: ['#c78782', '#fff0d8'],
    },
    {
      id: 'luna',
      name: '루나',
      tier: 'A+',
      collection: 'original',
      detail: '분홍빛 머리와 로즈 드레스의 성인 캐릭터',
      colors: ['#d990ac', '#f1c7cc'],
    },
    {
      id: 'apron',
      name: '레온',
      tier: 'A',
      collection: 'original',
      detail: '금발과 아이보리 테일코트 · 금빛 체인',
      colors: ['#eee1c6', '#c39b45'],
    },
    {
      id: 'serin',
      name: '노아',
      tier: 'A',
      collection: 'original',
      detail: '짙은 짧은 머리와 남색 코트 · 안경과 스카프',
      colors: ['#28384f', '#8cacc0'],
    },
    {
      id: 'sylvie',
      name: '로언',
      tier: 'B',
      collection: 'tier',
      detail: '숲색 후드와 짧은 레인저 망토 · 가죽 크로스백',
      colors: ['#3f6655', '#8b5d3f'],
    },
    {
      id: 'astra',
      name: '아스트라',
      tier: 'S',
      collection: 'tier',
      detail: '은발과 네이비 제복 · 별의 관과 움직이는 왕실 망토',
      colors: ['#304870', '#dce3ee'],
    },
    {
      id: 'seraphine',
      name: '세라핀',
      tier: 'S+',
      collection: 'tier',
      detail: '황금 관과 빛의 날개를 두른 천상의 무희',
      colors: ['#c69d49', '#fff1d8'],
    },
    {
      id: 'aurelia',
      name: '아우렐리아',
      tier: 'S+',
      collection: 'tier',
      detail: '노란 양갈래 머리와 하얀 피부 · 꽃 자수 앞치마와 풍성한 긴 치마',
      colors: ['#f4cd62', '#f0d6c5'],
    },
  ],
  motion: [
    {
      id: 'signature',
      name: '시그니처',
      tier: 'C',
      collection: 'original',
      detail: '아바타 고유의 기본 승리 춤',
      colors: ['#809588', '#e6ebdd'],
    },
    {
      id: 'encore',
      name: '앙코르',
      tier: 'C',
      collection: 'original',
      detail: '아바타 고유의 또 다른 승리 인사',
      colors: ['#aa8e8c', '#eee1d9'],
    },
    {
      id: 'ribbon',
      name: '리본 스텝',
      tier: 'B',
      collection: 'tier',
      detail: '경쾌한 좌우 스텝과 부드러운 팔의 곡선',
      colors: ['#779b8b', '#cce8dc'],
    },
    {
      id: 'waltz',
      name: '로열 왈츠',
      tier: 'A',
      collection: 'tier',
      detail: '중심을 옮기며 이어지는 우아한 회전',
      colors: ['#8a70a5', '#e9d5f3'],
    },
    {
      id: 'moonwalk',
      name: '달빛 턴',
      tier: 'A+',
      collection: 'tier',
      detail: '달을 그리듯 팔을 펼치는 유려한 턴',
      colors: ['#807ec0', '#e0e5ff'],
    },
    {
      id: 'constellation',
      name: '별자리 무도',
      tier: 'S',
      collection: 'tier',
      detail: '별처럼 팔다리를 펼치고 중심을 옮기는 회전',
      colors: ['#4c79ae', '#b4e2fa'],
    },
    {
      id: 'apotheosis',
      name: '천상의 피날레',
      tier: 'S+',
      collection: 'tier',
      detail: '큰 팔 동작과 나선형 회전 뒤에 맺는 피날레',
      colors: ['#b88c39', '#fff0bd'],
    },
  ],
  board: [
    {
      id: 'wood',
      name: '기본 나무',
      tier: 'C',
      collection: 'original',
      detail: '따뜻하고 자연스러운 나뭇결 바둑판',
      colors: ['#d6ad72', '#886043'],
    },
    {
      id: 'oak',
      name: '크림',
      tier: 'B',
      collection: 'original',
      detail: '따뜻한 크림빛 도자기와 로즈 테두리',
      colors: ['#e9dfd9', '#c2afb5'],
    },
    {
      id: 'walnut',
      name: '로즈',
      tier: 'B',
      collection: 'original',
      detail: '우윳빛 분홍 유약과 작은 꽃 장식',
      colors: ['#ddbac9', '#b58ca5'],
    },
    {
      id: 'linen',
      name: '라일락',
      tier: 'B',
      collection: 'original',
      detail: '은은한 보랏빛 도자기와 부드러운 곡선',
      colors: ['#cac5e0', '#9c93b8'],
    },
    {
      id: 'ink',
      name: '미드나이트',
      tier: 'B',
      collection: 'original',
      detail: '밤하늘빛 도자기에 새긴 라일락 격자',
      colors: ['#464d70', '#313752'],
    },
    {
      id: 'meadow',
      name: '세이지',
      tier: 'B',
      collection: 'original',
      detail: '차분한 연녹색 유약과 잎빛 테두리',
      colors: ['#c4d6ca', '#8faa9c'],
    },
    {
      id: 'marble',
      name: '대리석',
      tier: 'A',
      collection: 'tier',
      detail: '깊이 있는 석맥과 금속 테두리',
      colors: ['#ded8df', '#8e7b90'],
    },
    {
      id: 'moonstone',
      name: '월광석',
      tier: 'A+',
      collection: 'tier',
      detail: '은은한 월광과 보석 장식의 테두리',
      colors: ['#d1d0ee', '#8684b4'],
    },
    {
      id: 'celestial',
      name: '성좌',
      tier: 'S',
      collection: 'tier',
      detail: '빛나는 별의 궤도와 밤하늘의 판면',
      colors: ['#344a72', '#8ecbe9'],
    },
    {
      id: 'imperial',
      name: '천상의 회랑',
      tier: 'S+',
      collection: 'tier',
      detail: '황금 기둥과 겹겹의 광채로 세운 천상의 판',
      colors: ['#e8dcb7', '#b18b3d'],
    },
  ],
} as const;

export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? (value as Partial<Appearance>) : {};
  const storedDances = input.dances && typeof input.dances === 'object' ? input.dances : DEFAULT_DANCES;
  const dances = Object.fromEntries(
    AVATARS.map((avatar) => [
      avatar,
      DANCES.includes(storedDances[avatar] as DanceStyle) ? storedDances[avatar] : DEFAULT_DANCES[avatar],
    ]),
  ) as Record<AvatarStyle, DanceStyle>;
  // Keep the selected legacy variant's dance when it becomes Luna. A saved Luna choice
  // takes precedence when another avatar was selected; the old rose entry is retained.
  if (
    DANCES.includes(storedDances.rose as DanceStyle) &&
    (input.avatar === 'rose' || !DANCES.includes(storedDances.luna as DanceStyle))
  ) {
    dances.luna = storedDances.rose;
  }
  return {
    stone: STONES.includes(input.stone as StoneStyle) ? input.stone! : DEFAULT_APPEARANCE.stone,
    avatar: normalizeAvatar(input.avatar),
    board: BOARDS.includes(input.board as BoardStyle) ? input.board! : DEFAULT_APPEARANCE.board,
    dances,
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
