import * as migration_20260625_143658_initial from './20260625_143658_initial';

export const migrations = [
  {
    up: migration_20260625_143658_initial.up,
    down: migration_20260625_143658_initial.down,
    name: '20260625_143658_initial'
  },
];
