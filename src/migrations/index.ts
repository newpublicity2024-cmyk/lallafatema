import * as migration_20260625_143658_initial from './20260625_143658_initial';
import * as migration_20260625_153645_globals from './20260625_153645_globals';

export const migrations = [
  {
    up: migration_20260625_143658_initial.up,
    down: migration_20260625_143658_initial.down,
    name: '20260625_143658_initial',
  },
  {
    up: migration_20260625_153645_globals.up,
    down: migration_20260625_153645_globals.down,
    name: '20260625_153645_globals'
  },
];
