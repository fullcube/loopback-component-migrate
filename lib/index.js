var debug = require('debug')('loopback-component-migrate');
var loopback = require('loopback');
var migrationDef = require('./models/migration.json');
var migrationMapDef = require('./models/migration-map.json');

// Remove proerties that will confuse LB
function getSettings(def) {
  var settings = {};
  for (var s in def) {
    if (s === 'name' || s === 'properties') {
      continue;
    } else {
      settings[s] = def[s];
    }
  }
  return settings;
}

/**
 * @param {Object} app The app instance
 * @param {Object} options The options object
 */

module.exports = function(app, options) {
  var loopback = app.loopback;
  var dataSource = null;

  options = options || {};

  var  dataSourceName = options.dataSource || 'db';
  if (typeof  dataSourceName === 'string') {
    dataSource = app.dataSources[dataSourceName];
  }

  var migrationModelSettings = getSettings(migrationDef);
  var migrationMapModelSettings = getSettings(migrationMapDef);

  if (typeof options.acls !== 'object') {
    migrationModelSettings.acls = migrationMapModelSettings.acls = [];
  } else {
    migrationModelSettings.acls = migrationMapModelSettings.acls = options.acls;
  }

  debug('Creating Migration model using settings: %o', migrationModelSettings);
  var MigrationModel = dataSource.createModel(
    migrationDef.name,
    migrationDef.properties,
    migrationModelSettings);

  debug('Creating MigrationMap model using settings: %o', migrationModelSettings);
  var MigrationMapModel = dataSource.createModel(
    migrationMapDef.name,
    migrationMapDef.properties,
    migrationMapModelSettings);

  var Migration = require('./models/migration')(MigrationModel, options);
  var MigrationMap = require('./models/migration-map')(MigrationMapModel, options);

  app.model(Migration,    {dataSource: dataSourceName, public: !!options.enableRest });
  app.model(MigrationMap, {dataSource: dataSourceName, public: !!options.enableRest });

};
