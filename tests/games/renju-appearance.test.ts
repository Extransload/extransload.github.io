import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPTIONS,
  AVATARS,
  AVATAR_TIERS,
  BOARDS,
  DANCES,
  DANCE_NAMES,
  STONES,
  TIERS,
  appearanceForSeat,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  normalizePlayerAppearance,
  playerLook,
} from '../../src/domains/games/renju/appearance';

describe('Omokmaru appearance values', () => {
  it('keeps a separate dance choice for every avatar across selection and storage', () => {
    const selected = normalizeAppearance({
      stone: 'rose',
      avatar: 'luna',
      board: 'meadow',
      dances: { ...DEFAULT_APPEARANCE.dances, luna: 'encore', serin: 'signature' },
    });
    expect(appearanceForSeat('black', 'black', selected)).toEqual({ stone: 'rose', avatar: 'luna', dance: 'encore' });
    expect(appearanceForSeat('white', 'black', selected)).toEqual({
      stone: 'classic',
      avatar: 'luna',
      dance: 'encore',
    });
    const serin = normalizeAppearance({ ...selected, avatar: 'serin' });
    expect(appearanceForSeat('black', 'black', serin).dance).toBe('signature');
    expect(normalizeAppearance(JSON.parse(JSON.stringify(selected))).dances.luna).toBe('encore');
  });

  it('migrates older global victory settings and invalid dances to avatar defaults', () => {
    const old = normalizeAppearance({ avatar: 'serin', victory: 'spin', accessory: 'crown' });
    expect(old.avatar).toBe('serin');
    expect(old.dances).toEqual(DEFAULT_APPEARANCE.dances);
    expect(normalizeAppearance({ avatar: 'azure' }).avatar).toBe('petal');
    expect(normalizeAppearance({ dances: { petal: '__proto__', luna: 'encore' } }).dances).toEqual({
      ...DEFAULT_APPEARANCE.dances,
      luna: 'encore',
    });
  });

  it('uses plain black and white stones and wood as the first and default themes', () => {
    expect(APPEARANCE_OPTIONS.stone[0].id).toBe('classic');
    expect(APPEARANCE_OPTIONS.board[0].id).toBe('wood');
    expect(DEFAULT_APPEARANCE).toMatchObject({ stone: 'classic', board: 'wood' });
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ stone: 'jade', board: 'retired' })).toEqual(DEFAULT_APPEARANCE);
  });

  it('offers only the five kept boards plus the forest and beach editions, in wardrobe order', () => {
    expect(BOARDS).toEqual(['wood', 'walnut', 'linen', 'meadow', 'moonstone', 'forest', 'beach']);
    expect(APPEARANCE_OPTIONS.board.map((option) => [option.id, option.name])).toEqual([
      ['wood', '기본 나무'],
      ['walnut', '로즈'],
      ['linen', '라일락'],
      ['meadow', '세이지'],
      ['moonstone', '월광석'],
      ['forest', '반딧불 숲'],
      ['beach', '노을 해변'],
    ]);
    for (const retired of ['oak', 'ink', 'marble', 'celestial', 'imperial']) {
      expect(normalizeAppearance({ board: retired }).board).toBe('wood');
    }
  });

  it('preserves stored custom stones and boards when adding the base themes', () => {
    for (const board of ['walnut', 'linen', 'meadow', 'moonstone', 'forest', 'beach']) {
      const saved = { stone: 'rose', board, avatar: 'luna', dances: { luna: 'encore' } };
      expect(normalizeAppearance(JSON.parse(JSON.stringify(saved)))).toMatchObject(saved);
    }
  });

  it('sends and accepts every stone choice while defaulting unknown remote looks to classic', () => {
    for (const stone of STONES) {
      const selected = normalizeAppearance({ stone, avatar: 'serin', dances: { serin: 'encore' } });
      const look = { stone, avatar: 'serin', dance: 'encore' };
      expect(playerLook(selected)).toEqual(look);
      expect(normalizePlayerAppearance(look)).toEqual(look);
    }
    expect(normalizePlayerAppearance(null)).toEqual({ stone: 'classic', avatar: 'petal', dance: 'signature' });
    expect(normalizePlayerAppearance({ stone: 'jade', avatar: 'luna', dance: 'encore' })).toEqual({
      stone: 'classic',
      avatar: 'luna',
      dance: 'encore',
    });
  });

  it('adds Aurelia to the seven existing avatars and accepts the retired variant only as a migration alias', () => {
    expect(APPEARANCE_OPTIONS).not.toHaveProperty('victory');
    expect(APPEARANCE_OPTIONS.avatar.map(({ id }) => id)).toEqual([
      'petal',
      'luna',
      'apron',
      'serin',
      'sylvie',
      'astra',
      'seraphine',
      'aurelia',
    ]);
    expect(APPEARANCE_OPTIONS.motion.map(({ id }) => id)).toEqual(DANCES);
    for (const avatar of AVATARS) {
      const selected = normalizeAppearance({ avatar });
      const currentAvatar = avatar === 'rose' ? 'luna' : avatar;
      expect(selected.avatar).toBe(currentAvatar);
      expect(appearanceForSeat('white', 'black', selected).avatar).toBe(currentAvatar);
    }
    expect(APPEARANCE_OPTIONS.avatar.map(({ name }) => name)).toEqual([
      '페탈',
      '루나',
      '레온',
      '노아',
      '로언',
      '아스트라',
      '세라핀',
      '아우렐리아',
    ]);
  });

  it('migrates the retired rose avatar to Luna and preserves its selected dance', () => {
    expect(AVATARS).toContain('rose');
    const migrated = normalizeAppearance({
      avatar: 'rose',
      dances: { luna: 'moonwalk', rose: 'encore', petal: 'waltz' },
    });
    expect(migrated).toMatchObject({
      avatar: 'luna',
      dances: { luna: 'encore', rose: 'encore', petal: 'waltz' },
    });
    expect(normalizeAppearance(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    expect(normalizePlayerAppearance({ avatar: 'rose', stone: 'classic', dance: 'constellation' })).toEqual({
      avatar: 'luna',
      stone: 'classic',
      dance: 'constellation',
    });
    expect(normalizeAppearance({ avatar: 'petal', dances: { luna: 'moonwalk', rose: 'encore' } }).dances.luna).toBe(
      'moonwalk',
    );
    expect(normalizeAppearance({ avatar: 'petal', dances: { rose: 'waltz' } }).dances.luna).toBe('waltz');
    expect(normalizeAppearance({ avatar: 'rose', dances: { rose: 'retired', luna: 'ribbon' } }).dances.luna).toBe(
      'ribbon',
    );
    expect(normalizeAppearance({ avatar: 'rose', dances: { rose: 'retired' } }).dances.luna).toBe('signature');
  });

  it('assigns the agreed original tiers and keeps every default at C', () => {
    expect(TIERS).toEqual(['C', 'B', 'A', 'A+', 'S', 'S+']);
    expect(APPEARANCE_OPTIONS.stone.find(({ id }) => id === 'rose')?.tier).toBe('B');
    expect(AVATAR_TIERS).toMatchObject({ petal: 'C', luna: 'A+', apron: 'A', rose: 'A', serin: 'A' });
    expect(
      APPEARANCE_OPTIONS.board.filter(({ collection }) => collection === 'original').map(({ tier }) => tier),
    ).toEqual(['C', 'B', 'B', 'B']);
    expect(
      APPEARANCE_OPTIONS.motion.filter(({ collection }) => collection === 'original').map(({ tier }) => tier),
    ).toEqual(['C', 'C']);
    const defaultIds = {
      stone: DEFAULT_APPEARANCE.stone,
      avatar: DEFAULT_APPEARANCE.avatar,
      motion: DEFAULT_APPEARANCE.dances[DEFAULT_APPEARANCE.avatar],
      board: DEFAULT_APPEARANCE.board,
    };
    for (const category of Object.keys(defaultIds) as (keyof typeof defaultIds)[]) {
      expect(APPEARANCE_OPTIONS[category].find(({ id }) => id === defaultIds[category])?.tier).toBe('C');
    }
  });

  it('keeps every tier covered and adds a second S+ avatar without replacing Seraphine', () => {
    const expectedNewTiers = {
      stone: ['A', 'A+', 'S', 'S+'],
      avatar: ['B', 'S', 'S+', 'S+'],
      motion: ['B', 'A', 'A+', 'S', 'S+'],
      board: ['A+', 'S', 'S+'],
    };
    let additions = 0;
    for (const category of Object.keys(APPEARANCE_OPTIONS) as (keyof typeof APPEARANCE_OPTIONS)[]) {
      const options = APPEARANCE_OPTIONS[category];
      const newOptions = options.filter(({ collection }) => collection === 'tier');
      expect(newOptions.map(({ tier }) => tier)).toEqual(expectedNewTiers[category]);
      // The trimmed board line-up keeps no A-tier board; every other category still spans all tiers.
      expect(new Set(options.map(({ tier }) => tier))).toEqual(
        new Set(category === 'board' ? TIERS.filter((tier) => tier !== 'A') : TIERS),
      );
      expect(new Set(options.map(({ id }) => id)).size).toBe(options.length);
      additions += newOptions.length;
    }
    expect(additions).toBe(16);
    expect(APPEARANCE_OPTIONS.avatar.filter(({ tier }) => tier === 'S+').map(({ id }) => id)).toEqual([
      'seraphine',
      'aurelia',
    ]);
    expect(APPEARANCE_OPTIONS.stone.map(({ id }) => id)).toEqual(STONES);
    expect(APPEARANCE_OPTIONS.board.map(({ id }) => id)).toEqual(BOARDS);
    for (const avatar of APPEARANCE_OPTIONS.avatar) expect(avatar.tier).toBe(AVATAR_TIERS[avatar.id]);
  });

  it('round-trips every new avatar and motion without changing another avatar choice', () => {
    for (const { id: avatar } of APPEARANCE_OPTIONS.avatar) {
      for (const dance of DANCES) {
        const selected = normalizeAppearance({
          avatar,
          stone: 'sovereign',
          board: 'beach',
          dances: { ...DEFAULT_APPEARANCE.dances, [avatar]: dance },
        });
        const restored = normalizeAppearance(JSON.parse(JSON.stringify(selected)));
        expect(restored).toEqual(selected);
        expect(normalizePlayerAppearance(playerLook(restored))).toEqual({ stone: 'sovereign', avatar, dance });
        expect(DANCE_NAMES[avatar][dance]).toBeTruthy();
        for (const peer of AVATARS) {
          if (peer !== avatar) expect(restored.dances[peer]).toBe('signature');
        }
      }
    }
  });
});
