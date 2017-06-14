'use strict';

var debug = require('debug')('loopback-component-migrate');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var utils = require('loopback/lib/utils');
var util = require('util');

module.exports = function(Migration, options) {
  options = options || {};
  Migration.log = options.log || console;
  Migration.log = typeof Migration.log === 'string' ? require(Migration.log) : Migration.log;
  Migration.migrationsDir = options.migrationsDir || path.join(process.cwd(), 'server', 'migrations');
  debug('Migrations directory set to: %s', Migration.migrationsDir);

  /**
   * Remote Method: Run pending migrations.
   *
   * @param {String} [to] Name of the migration script to migrate to.
   * @param {Function} [cb] Callback function.
   */
  Migration.migrateTo = function(to, cb) {
    to = to || '';
    cb = cb || utils.createPromiseCallback();
    assert(typeof to === 'string', 'The to argument must be a string, not ' + typeof to);
    assert(typeof cb === 'function', 'The cb argument must be a function, not ' + typeof cb);
    Migration.migrate('up', to, cb);
    return cb.promise;
  };

  /**
   * Remote Method: Rollback migrations.
   *
   * @param {String} [to] Name of migration script to rollback to.
   * @param {Function} [cb] Callback function.
   */
  Migration.rollbackTo = function(to, cb) {
    to = to || '';
    cb = cb || utils.createPromiseCallback();
    assert(typeof to === 'string', 'The to argument must be a string, not ' + typeof to);
    assert(typeof cb === 'function', 'The cb argument must be a function, not ' + typeof cb);
    Migration.migrate('down', to, cb);
    return cb.promise;
  };

  /**
   * Remote Method: Run specific migration by name.
   *
   * @param {String} [name] Name of migration script to run.
   * @param {String} [record] Record the migration runtime to database.
   * @param {Function} [cb] Callback function.
   */
  Migration.migrateByName = function(name, record, cb) {
    if (typeof cb === 'undefined' && typeof record === 'function') {
      cb = record;
      record = false;
    }

    record = record || false;
    cb = cb || utils.createPromiseCallback();
    assert(typeof name === 'string', 'The to argument must be a string, not ' + typeof name);
    assert(typeof cb === 'function', 'The cb argument must be a function, not ' + typeof cb);

    if (Migration.app.migrating) {
      Migration.log.warn('Migration: Unable to start migration (already running)');
      process.nextTick(function() {
        cb();
      });
      return cb.promise;
    }

    Migration.hrstart = process.hrtime();
    Migration.app.migrating = true;

    Migration.log.info('Migration: running script', name);
    const scriptPath = path.resolve(path.join(Migration.migrationsDir, name));

    try {
      require(scriptPath).up(Migration.app, function(err) {
        if (record) {
          Migration.create({
            name: name,
            runDtTm: new Date()
          });
        }
        Migration.finish(err);
        return cb();
      });
    } catch (err) {
      Migration.log.error(`Migration: Error running script ${name}:`, err);
      Migration.finish(err);
      cb(err);
    }

    return cb.promise;
  };

  /**
   * Run migrations (up or down).
   *
   * @param {String} [upOrDown] Direction (up or down)
   * @param {String} [to] Name of migration script to migrate/rollback to.
   * @param {Function} [cb] Callback function.
   */
  Migration.migrate = function(upOrDown, to, cb) {
    if (cb === undefined) {
      if (typeof to === 'function') {
        cb = to;
        to = '';
      }
    }
    upOrDown = upOrDown || 'up';
    to = to || '';
    cb = cb || utils.createPromiseCallback();

    assert(typeof upOrDown === 'string', 'The upOrDown argument must be a string, not ' + typeof upOrDown);
    assert(typeof to === 'string', 'The to argument must be a string, not ' + typeof to);
    assert(typeof cb === 'function', 'The cb argument must be a function, not ' + typeof cb);

    if (Migration.app.migrating) {
      Migration.log.warn('Migration: Unable to start migrations (already running)');
      process.nextTick(function() {
        cb();
      });
      return cb.promise;
    }

    Migration.hrstart = process.hrtime();
    Migration.app.migrating = true;

    Migration.findScriptsToRun(upOrDown, to, function runScripts(err, scriptsToRun) {
      scriptsToRun = scriptsToRun || [];
      var migrationCallStack = [];
      var migrationCallIndex = 0;

      if (scriptsToRun.length) {
        Migration.log.info('Migration: Running migration scripts', scriptsToRun);
      }

      scriptsToRun.forEach(function(localScriptName) {
        migrationCallStack.push(function() {

          var migrationStartTime;

          // keep calling scripts recursively until we are done, then exit
          function runNextScript(err) {
            if (err) {
              Migration.log.error('Migration: Error saving migration %s to database', localScriptName);
              Migration.finish(err);
              return cb(err);
            }

            var migrationEndTime = process.hrtime(migrationStartTime);
            Migration.log.info('Migration: %s finished sucessfully. Migration time was %ds %dms',
              localScriptName, migrationEndTime[0], migrationEndTime[1] / 1000000);
            migrationCallIndex++;
            if (migrationCallIndex < migrationCallStack.length) {
              migrationCallStack[migrationCallIndex]();
            } else {
              Migration.finish(err);
              return cb();
            }
          }

          try {
            // include the script, run the up/down function, update the migrations table, and continue
            migrationStartTime = process.hrtime();
            Migration.log.info('Migration: Running script', localScriptName);
            const scriptPath = path.resolve(path.join(Migration.migrationsDir, localScriptName));
            require(scriptPath)[upOrDown](Migration.app, function(err) {
              if (err) {
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
            Migration.finish(err);
            cb(err);
          }
        });
      });

      // kick off recursive calls
      if (migrationCallStack.length) {
        migrationCallStack[migrationCallIndex]();
      } else {
        delete Migration.app.migrating;
        Migration.emit('complete');
        Migration.log.info('Migration: No new migrations to run.');
        return cb();
      }
    });

    return cb.promise;
  };

  Migration.finish = function(err) {
    if (err) {
      Migration.emit('error', err);
    } else {
      Migration.emit('complete');
    }
  };

  Migration.findScriptsToRun = function(upOrDown, to, cb) {
    upOrDown = upOrDown || 'up';
    to = to || '';
    cb = cb || utils.createPromiseCallback();

    debug('findScriptsToRun direction:%s, to:%s', upOrDown, to ? to : 'undefined');

    // Add .js to the script name if it wasn't provided.
    if (to && to.substring(to.length - 3, to.length) !== '.js') {
      to = to + '.js';
    }

    var scriptsToRun = [];
    var order = upOrDown === 'down' ? 'name DESC' : 'name ASC';
    var filters = {
      order: order
    };

    if (to) {
      // DOWN: find only those that are greater than the 'to' point in descending order.
      if (upOrDown === 'down') {
        filters.where = {
          name: {
            gte: to
          }
        };
      }
      // UP: find only those that are less than the 'to' point in ascending order.
      else {
        filters.where = {
          name: {
            lte: to
          }
        };
      }
    }
    debug('fetching migrations from db using filter %j', filters);
    Migration.find(filters)
      .then(function(scriptsAlreadyRan) {
        scriptsAlreadyRan = scriptsAlreadyRan.map(Migration.mapScriptObjName);
        debug('scriptsAlreadyRan: %j', scriptsAlreadyRan);

        // Find rollback scripts.
        if (upOrDown === 'down') {

          // If the requested rollback script has not already run return just the requested one if it is a valid script.
          // This facilitates rollback of failed migrations.
          if (to && scriptsAlreadyRan.indexOf(to) === -1) {
            debug('requested script has not already run - returning single script as standalone rollback script');
            scriptsToRun = [to];
            return cb(null, scriptsToRun);
          }

          // Remove the last item since we don't want to roll back the requested script.
          if (scriptsAlreadyRan.length && to) {
            scriptsAlreadyRan.pop();
            debug('remove last item. scriptsAlreadyRan: %j', scriptsAlreadyRan);
          }
          scriptsToRun = scriptsAlreadyRan;

          debug('Found scripts to run: %j', scriptsToRun);
          cb(null, scriptsToRun);
        }

        // Find migration scripts.
        else {
          // get all local scripts and filter for only .js files
          var candidateScripts = fs.readdirSync(Migration.migrationsDir).filter(function(fileName) {
            return fileName.substring(fileName.length - 3, fileName.length) === '.js';
          });
          debug('Found %s candidate scripts: %j', candidateScripts.length, candidateScripts);

          // filter out those that come after the requested to value.
          if (to) {
            candidateScripts = candidateScripts.filter(function(fileName) {
              var inRange = fileName <= to;
              debug('checking wether %s is in range (%s <= %s): %s', fileName, fileName, to, inRange);
              return inRange;
            });
          }

          // filter out those that have already ran
          candidateScripts = candidateScripts.filter(function(fileName) {
            debug('checking wether %s has already run', fileName);
            var alreadyRan = scriptsAlreadyRan.indexOf(fileName) !== -1;
            debug('checking wether %s has already run: %s', fileName, alreadyRan);
            return !alreadyRan;
          });

          scriptsToRun = candidateScripts;
          debug('Found scripts to run: %j', scriptsToRun);
          cb(null, scriptsToRun);
        }
      })
      .catch(function(err) {
        Migration.log.error('Migration: Error retrieving migrations', err);
        cb(err);
      });

    return cb.promise;
  };

  Migration.mapScriptObjName = function(scriptObj) {
    return scriptObj.name;
  };

  Migration.on('error', (err) => {
    Migration.log.error('Migration: Migrations did not complete. An error was encountered:', err);
    delete Migration.app.migrating;
  });

  Migration.on('complete', (err) => {
    var hrend = process.hrtime(Migration.hrstart);
    Migration.log.info('Migration: All migrations have run without any errors.');
    Migration.log.info('Migration: Total migration time was %ds %dms', hrend[0], hrend[1] / 1000000);
    delete Migration.app.migrating;
  });

  return Migration;
};
