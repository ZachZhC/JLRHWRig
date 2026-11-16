import type { DoorId, Direction } from './types';

export const DOOR_IDS: DoorId[] = ['FL', 'FR', 'RL', 'RR'];

export const DOOR_META: Record<DoorId, { name: string; keys: [string, string] }> = {
  FL: { name: 'Front Left',  keys: ['Q', 'A'] },
  FR: { name: 'Front Right', keys: ['W', 'S'] },
  RL: { name: 'Rear Left',   keys: ['E', 'D'] },
  RR: { name: 'Rear Right',  keys: ['R', 'F'] },
};

export const KEY_MAP: Record<string, { door: DoorId; dir: Direction }> = {
  q: { door: 'FL', dir: 'UP' },
  a: { door: 'FL', dir: 'DOWN' },
  w: { door: 'FR', dir: 'UP' },
  s: { door: 'FR', dir: 'DOWN' },
  e: { door: 'RL', dir: 'UP' },
  d: { door: 'RL', dir: 'DOWN' },
  r: { door: 'RR', dir: 'UP' },
  f: { door: 'RR', dir: 'DOWN' },
};
