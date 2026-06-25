import * as migration_20260625_102845_initial from './20260625_102845_initial';

export const migrations = [
  {
    up: migration_20260625_102845_initial.up,
    down: migration_20260625_102845_initial.down,
    name: '20260625_102845_initial'
  },
];
