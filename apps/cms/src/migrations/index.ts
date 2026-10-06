import * as migration_20261006_123917_initial from './20261006_123917_initial';
import * as migration_20261006_145541_blob_storage from './20261006_145541_blob_storage';

export const migrations = [
  {
    up: migration_20261006_123917_initial.up,
    down: migration_20261006_123917_initial.down,
    name: '20261006_123917_initial',
  },
  {
    up: migration_20261006_145541_blob_storage.up,
    down: migration_20261006_145541_blob_storage.down,
    name: '20261006_145541_blob_storage'
  },
];
