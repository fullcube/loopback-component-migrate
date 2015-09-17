'use strict';

var debug = require('debug')('loopback-db-migrate');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var utils = require('loopback-datasource-juggler/lib/utils');

module.exports = function(Migration, options) {
  options = options || {};
  Migration.log = options.log || console;
  Migration.migrationsDir = options.migrationsDir || path.join(process.cwd(), 'server', 'migrations');
  debug('Migrations directory set to: %s', Migration.migrationsDir);

  Migration.migrate = function(upOrDown, to, options, cb) {
    if (cb === undefined) {
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
    }
    upOrDown = upOrDown || 'up';
    to = to || '';
    options = options || {};
    cb = cb || utils.createPromiseCallback();

    assert(typeof upOrDown === 'string', 'The upOrDown argument must be a string, not ' + typeof upOrDown);
    assert(typeof to === 'string', 'The to argument must be a string, not ' + typeof to);
    assert(typeof options === 'object', 'The options argument must be an object, not ' + typeof options);
    assert(typeof cb === 'function', 'The cb argument must be a function, not ' + typeof cb);

    Migration.app.migrating = true;

    Migration.hrstart = process.hrtime();
    Migration.app.migrating = true;

    Migration.findScriptsToRun(upOrDown, to, function runScripts(err, scriptsToRun) {
      scriptsToRun = scriptsToRun || [];
      var migrationCallStack = [];
      var migrationCallIndex = 0;

      scriptsToRun.forEach(function(localScriptName) {
        migrationCallStack.push(function() {

          var migrationStartTime;

          // keep calling scripts recursively until we are done, then exit
          function runNextScript(err) {
            if (err) {
              Migration.log.error('Error saving migration', localScriptName, 'to database!');
              Migration.log.error(err);
              Migration.finish(err);
              return cb(err);
            }

            var migrationEndTime = process.hrtime(migrationStartTime);
            Migration.log.info('%s finished sucessfully. Migration time was %ds %dms',
              localScriptName, migrationEndTime[0], migrationEndTime[1] / 1000000);
            migrationCallIndex++;
            if (migrationCallIndex < migrationCallStack.length) {
              migrationCallStack[migrationCallIndex]();
            } else {
              Migration.finish();
              return cb();
            }
          }

          try {
            // include the script, run the up/down function, update the migrations table, and continue
            migrationStartTime = process.hrtime();
            Migration.log.info(localScriptName, 'running.');
            require(path.join(Migration.migrationsDir, localScriptName))[upOrDown](Migration.app, function(err) {
              if (err) {
                Migration.log.error(localScriptName, 'error:');
                Migration.log.error(err.stack);
                Migration.finish(err);
                return cb(err);
              } else if (upOrDown === 'up') {
                Migration.create({
                  name: localScriptName,
                  runDtTm: new Date()
                }, runNextScript);
              } else {
                Migration.destroyAll({
                  name: localScriptName
                }, runNextScript);
              }
            });
          } catch (err) {
            Migration.log.error('Error running migration', localScriptName);
            Migration.log.error(err.stack);
            Migration.finish(err);
            cb(err);
          }
        });
      });

      // kick off recursive calls
      if (migrationCallStack.length) {
        migrationCallStack[migrationCallIndex]();
      } else {
        Migration.log.info('No new migrations to run.');
        Migration.tearDown();
        cb();
      }
    });

    return cb.promise;
  };

  Migration.tearDown = function() {
    delete Migration.app.migrating;
  };

  Migration.finish = function(err) {
    Migration.tearDown();
    var hrend = process.hrtime(Migration.hrstart);
    Migration.log.info('All migrations have run without any errors.');
    Migration.log.info('Total migration time was %ds %dms', hrend[0], hrend[1] / 1000000);
  };

  Migration.findScriptsToRun = function(upOrDown, to, cb) {
    cb = cb || utils.createPromiseCallback();

    // get all scripts that have been run from DB
    var filters = {
      where: {
        name: {
          gte: to + '' || ''
        }
      },
      order: (upOrDown === 'up') ? 'name ASC' : 'name DESC'
    };
    Migration.find(filters)
      .then(function(scriptsRun) {
        var candidateScripts = [];

        // Find rollback scripts.
        if (upOrDown === 'down') {
          // return all db script names
          debug('Scripts that exist in db: %j', scriptsRun);
          candidateScripts = scriptsRun.map(Migration.mapScriptObjName);

          // If the requested rollback script has not already run return just that one if it is a valid script.
          // This facilitates rollback of failed migrations.
          if (!candidateScripts.length) {
            candidateScripts = [to];
          }

          cb(null, candidateScripts);
        }

        // Find migration scripts.
        else {
          // get all local scripts and filter for only .js files
          candidateScripts = fs.readdirSync(Migration.migrationsDir).filter(function(fileName) {
            return fileName.substring(fileName.length - 3, fileName.length) === '.js';
          });
          debug('Found %s migration scripts: %j', candidateScripts.length, candidateScripts);

          // filter out those that come after the requested to value.
          if (to) {
            candidateScripts = candidateScripts.filter(function(fileName) {
              var name = fileName.slice(0, -3);
              debug('checking wether to run %s (%s <= %s)', name, name, to);
              var inRange = name <= to;
              debug('is in range: %s', inRange);
              return inRange;
            });
          }

          // return scripts that exist on disk but not in the db
          var runScriptsNames = scriptsRun.map(Migration.mapScriptObjName);
          var scriptsToRun = candidateScripts.filter(function(scriptName) {
            return runScriptsNames.indexOf(scriptName) < 0;
          });
          debug('Scripts that exist on disk but not in db: %j', scriptsToRun);

          cb(null, scriptsToRun);
        }
      })
      .catch(function(err) {
        Migration.log.error('Error retrieving migrations:');
        Migration.log.error(err.stack);
        cb(err);
      });

    return cb.promise;
  };

  Migration.mapScriptObjName = function(scriptObj) {
    return scriptObj.name;
  };

  return Migration;
};
