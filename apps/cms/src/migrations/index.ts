import * as migration_20261006_123917_initial from './20261006_123917_initial';
import * as migration_20261006_145541_blob_storage from './20261006_145541_blob_storage';
import * as migration_20261021_083345_landing_pages from './20261021_083345_landing_pages';

export const migrations = [
  {
    up: migration_20261006_123917_initial.up,
    down: migration_20261006_123917_initial.down,
    name: '20261006_123917_initial',
  },
  {
    up: migration_20261006_145541_blob_storage.up,
    down: migration_20261006_145541_blob_storage.down,
    name: '20261006_145541_blob_storage',
  },
  {
    up: migration_20261021_083345_landing_pages.up,
    down: migration_20261021_083345_landing_pages.down,
    name: '20261021_083345_landing_pages'
  },
];
