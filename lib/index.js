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
  options = options || {};

  var dataSource = options.dataSource || 'db';
  if (typeof dataSource === 'string') {
    dataSource = app.dataSources[dataSource];
  }

  var migrationModelSettings = getSettings(migrationDef);
  var migrationMapModelSettings = getSettings(migrationMapDef);

  if (typeof options.acls !== 'object') {
    migrationModelSettings.acls = migrationMapModelSettings.acls = [];
  } else {
    migrationModelSettings.acls = migrationMapModelSettings.acls = options.acls;
  }

  // Support for loopback 2.x.
  if (app.loopback.version.startsWith(2)) {
    Object.keys(migrationModelSettings.methods).forEach(key => {
      migrationModelSettings.methods[key].isStatic = true;
    });
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

  app.model(Migration, options);
  app.model(MigrationMap, options);

  if (!options.enableRest) {
    if (Migration.disableRemoteMethodByName) {
      // Loopback 3.x+
      Migration.disableRemoteMethodByName('migrateTo');
      Migration.disableRemoteMethodByName('rollbackTo');
    } else {
      // Loopback 2.x
      Migration.disableRemoteMethod('migrateTo', true);
      Migration.disableRemoteMethod('rollbackTo', true);
    }
  }
};
