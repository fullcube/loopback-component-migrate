var debug = require('debug')('loopback-db-migrate');
var loopback = require('loopback');
var DataModel = loopback.PersistedModel || loopback.DataModel;

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

  debug('Creating Migration model');
  var MigrationModel = dataSource.createModel(
    migrationDef.name,
    migrationDef.properties,
    getSettings(migrationDef));
  var MigrationMapModel = dataSource.createModel(
    migrationMapDef.name,
    migrationMapDef.properties,
    getSettings(migrationMapDef));
  var Migration = require('./models/migration')(MigrationModel, options);
  var MigrationMap = require('./models/migration-map')(MigrationMapModel, options);

  app.model(Migration);
  app.model(MigrationMap);

  if (!options.enableRest) {
    Migration.disableRemoteMethod('migrateTo', true);
    Migration.disableRemoteMethod('rollbackTo', true);
  }
};
