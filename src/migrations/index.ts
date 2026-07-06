import * as migration_20260625_143658_initial from './20260625_143658_initial';
import * as migration_20260625_153645_globals from './20260625_153645_globals';
import * as migration_20260630_102430_add_ads from './20260630_102430_add_ads';
import * as migration_20260630_103006_add_site_settings from './20260630_103006_add_site_settings';
import * as migration_20260630_103756_add_homepage_curation from './20260630_103756_add_homepage_curation';
import * as migration_20260701_113624_add_category_seo from './20260701_113624_add_category_seo';
import * as migration_20260701_120518_add_redirects from './20260701_120518_add_redirects';
import * as migration_20260706_115449_add_consent_settings from './20260706_115449_add_consent_settings';

export const migrations = [
  {
    up: migration_20260625_143658_initial.up,
    down: migration_20260625_143658_initial.down,
    name: '20260625_143658_initial',
  },
  {
    up: migration_20260625_153645_globals.up,
    down: migration_20260625_153645_globals.down,
    name: '20260625_153645_globals',
  },
  {
    up: migration_20260630_102430_add_ads.up,
    down: migration_20260630_102430_add_ads.down,
    name: '20260630_102430_add_ads',
  },
  {
    up: migration_20260630_103006_add_site_settings.up,
    down: migration_20260630_103006_add_site_settings.down,
    name: '20260630_103006_add_site_settings',
  },
  {
    up: migration_20260630_103756_add_homepage_curation.up,
    down: migration_20260630_103756_add_homepage_curation.down,
    name: '20260630_103756_add_homepage_curation',
  },
  {
    up: migration_20260701_113624_add_category_seo.up,
    down: migration_20260701_113624_add_category_seo.down,
    name: '20260701_113624_add_category_seo',
  },
  {
    up: migration_20260701_120518_add_redirects.up,
    down: migration_20260701_120518_add_redirects.down,
    name: '20260701_120518_add_redirects',
  },
  {
    up: migration_20260706_115449_add_consent_settings.up,
    down: migration_20260706_115449_add_consent_settings.down,
    name: '20260706_115449_add_consent_settings'
  },
];
