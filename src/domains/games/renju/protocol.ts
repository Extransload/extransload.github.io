import type { Move } from './rules';
import type { PublicAppearance } from './appearance';

export type PlayerRole = 'black' | 'white';
export type RoomRole = PlayerRole | 'spectator';
export type PlayerIdentity = { name: string; country: string; maskedIp: string; appearance?: PublicAppearance };
export function normalizeGuestName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return /^[A-Za-z][A-Za-z0-9 -]{2,29}$/.test(name) ? name : null;
}
export type ChatMessage = {
  id: string;
  name: string;
  country: string;
  maskedIp: string;
  role: RoomRole;
  text: string;
  at: number;
};
export type PublicRoom = {
  id: string;
  status: GameStatus;
  joined: boolean;
  connected?: Record<PlayerRole, boolean>;
  players: Record<PlayerRole, PlayerIdentity | null>;
  spectators: number;
  settings: GameSettings;
  createdAt: number;
};
export type GameStatus = 'waiting' | 'playing' | 'finished';
export type FinishReason = 'five' | 'resign' | 'full' | 'time' | 'disconnect';
export type GameSettings = {
  mainMinutes: number;
  byoSeconds: number;
  byoPeriods: number;
};
export type ClockState = {
  mainMs: number;
  periodsLeft: number;
  byoMs: number;
};
export type RoomSnapshot = {
  moves: Move[];
  status: GameStatus;
  winner?: PlayerRole | 'draw';
  reason?: FinishReason;
  version: number;
  joined: boolean;
  ready: Record<PlayerRole, boolean>;
  rematchDeadline: number | null;
  rematchClosed: boolean;
  connected: Record<PlayerRole, boolean>;
  spectators: number;
  spectatorList: { id: string; name: string }[];
  settings: GameSettings;
  clocks: Record<PlayerRole, ClockState> | null;
  activeSince: number | null;
  disconnects: Partial<Record<PlayerRole, number>>;
  serverNow: number;
  public: boolean;
  players: Record<PlayerRole, PlayerIdentity | null>;
  chat: ChatMessage[];
};

export const DEFAULT_SETTINGS: GameSettings = { mainMinutes: 10, byoSeconds: 30, byoPeriods: 3 };
export const DISCONNECT_GRACE_MS = 30_000;
export const REMATCH_WINDOW_MS = 10_000;
export const ROLES: PlayerRole[] = ['black', 'white'];

export function validSettings(value: unknown): value is GameSettings {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<GameSettings>;
  if (!Number.isInteger(item.mainMinutes) || !Number.isInteger(item.byoSeconds) || !Number.isInteger(item.byoPeriods))
    return false;
  const { mainMinutes, byoSeconds, byoPeriods } = item as GameSettings;
  return (
    mainMinutes >= 0 &&
    mainMinutes <= 60 &&
    byoSeconds >= 0 &&
    byoSeconds <= 120 &&
    byoPeriods >= 0 &&
    byoPeriods <= 10 &&
    (mainMinutes > 0 || byoSeconds > 0) &&
    ((byoSeconds === 0 && byoPeriods === 0) || (byoSeconds > 0 && byoPeriods > 0))
  );
}
