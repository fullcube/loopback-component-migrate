#!/usr/bin/env node
'use strict';

var fs = require('fs'),
    prompt = require('cli-prompt'),
    dbNameFlag = process.argv.indexOf('--datasource'),
    dbName = (dbNameFlag > -1) ? process.argv[dbNameFlag + 1] : 'db',
    dateSinceFlag = process.argv.indexOf('--since'),
    dateSinceFilter = (dateSinceFlag > -1) ? process.argv[dateSinceFlag + 1] : '',
    migrationsFolder = process.cwd() + '/server/migrations/',
    dbMigrationsFolder = migrationsFolder+dbName,
    datasource = require(process.cwd() + '/server/server.js').dataSources[dbName];

if (!datasource) {
    console.log('datasource \'' + dbName + '\' not found!');
    process.exit(1);
}

function initDatasource(app, datasource) {
  // Create the Migration model and attach to the app.
  var Migration = datasource.createModel('Migration', {
      'name': {
          'id': true,
          'type': 'String',
          'required': true,
          'length': 100
      },
      'db': {
          'type': 'String',
          'length': 100,
          'required': true
      },
      'runDtTm': {
          'type': 'Date',
          'required': true
      }
  });
  app.model(Migration);

  // Create the MigrationMap model and attach to the app.
  var MigrationMap = datasource.createModel('MigrationMap', {
      'type': {
          'type': 'String',
          'required': true,
      },
      'from': {
          'type': 'String',
          'required': true
      },
      'to': {
          'type': 'String',
          'required': true
      },
      'data': {
          'type': 'Object'
      }
  });
  app.model(MigrationMap);
}

// make migration folders if they don't exist
try {
    fs.mkdirSync(migrationsFolder);
} catch (e) {}
try {
    fs.mkdirSync(dbMigrationsFolder);
} catch (e) {}

function mapScriptObjName(scriptObj){
    return scriptObj.name;
}

function migrateScripts(app, upOrDown, options, cb) {
  var log = options.log || console;
  var hrstart = process.hrtime();
  app.migrating = true;

  function tearDown(err) {
    delete app.migrating;
    app.emit('migrate done', err);
  }

  function finish(err) {
    tearDown(err);
    var hrend = process.hrtime(hrstart);
    if (err) {
      return cb(err);
    }
    log.info('All migrations have run without any errors.');
    log.info('Total migration time was %ds %dms', hrend[0], hrend[1] / 1000000);
    cb();
  }

  function findScriptsToRun(upOrDown, done) {
      var filters = {
          where: {
              name: { gte: dateSinceFilter+'' || '' }
          },
          order: (upOrDown === 'up' ) ? 'name ASC' : 'name DESC'
      };

      // get all local scripts and filter for only .js files
      var localScriptNames = fs.readdirSync(dbMigrationsFolder).filter(function(fileName) {
          return fileName.substring(fileName.length - 3, fileName.length) === '.js';
      });

      // create table if not exists
      datasource.autoupdate('Migration', function (err) {
          if (err) {
              log.error('Error retrieving migrations:');
              log.error(err.stack);
              finish(err);
          }

          // get all scripts that have been run from DB
          datasource.models.Migration.find(filters, function (err, scriptsRun) {
              if (err) {
                  log.error('Error retrieving migrations:');
                  log.error(err.stack);
                  finish(err);
              }

              if (upOrDown === 'up') {
                  var runScriptsNames = scriptsRun.map(mapScriptObjName);

                  // return scripts that exist on disk but not in the db
                  done(localScriptNames.filter(function (scriptName) {
                      return runScriptsNames.indexOf(scriptName) < 0;
                  }));
              } else {
                  // return all db script names
                  done(scriptsRun.map(mapScriptObjName));
              }
          });
      });
  }

    datasource = app.dataSources[dbName];

    // FIXME: wait for this to complete before moving on.
    initDatasource(app, datasource);

        findScriptsToRun(upOrDown, function runScripts(scriptsToRun) {
            var migrationCallStack = [],
                migrationCallIndex = 0;

            scriptsToRun.forEach(function (localScriptName) {
                migrationCallStack.push(function () {

                    var migrationStartTime;

                    // keep calling scripts recursively until we are done, then exit
                    function runNextScript(err) {
                        if (err) {
                            log.error('Error saving migration', localScriptName, 'to database!');
                            log.error(err);
                            finish(err);
                        }

                        var migrationEndTime = process.hrtime(migrationStartTime);
                        log.info('%s finished sucessfully. Migration time was %ds %dms',
                          localScriptName, migrationEndTime[0], migrationEndTime[1] / 1000000);
                        migrationCallIndex++;
                        if (migrationCallIndex < migrationCallStack.length) {
                            migrationCallStack[migrationCallIndex]();
                        }
                        else {
                          finish();
                        }
                    }

                    try {
                        // include the script, run the up/down function, update the migrations table, and continue
                        migrationStartTime = process.hrtime();
                        log.info(localScriptName, 'running.');
                        require(dbMigrationsFolder + '/' + localScriptName)[upOrDown](app, function (err) {
                            if (err) {
                                log.error(localScriptName, 'error:');
                                log.error(err.stack);
                                finish(err);
                            } else if (upOrDown === 'up') {
                                datasource.models.Migration.create({
                                    name: localScriptName,
                                    db: dbName,
                                    runDtTm: new Date()
                                }, runNextScript);
                            } else {
                                datasource.models.Migration.destroyAll({
                                    name: localScriptName
                                }, runNextScript);
                            }
                        });
                    } catch (err) {
                        log.error('Error running migration', localScriptName);
                        log.error(err.stack);
                        finish(err);
                    }
                });
            });

            // kick off recursive calls
            if (migrationCallStack.length) {
                migrationCallStack[migrationCallIndex]();
            } else {
                log.info('No new migrations to run.');
                tearDown();
                cb();
            }
        });
}

function stringifyAndPadLeading(num) {
    var str = num + '';
    return (str.length === 1) ? '0' + str : str;
}

var cmds = {
    // up: migrateScripts('up'),
    // down: migrateScripts('down'),
    create: function create(name) {
        var cmdLineName = name || process.argv[process.argv.indexOf('create') + 1];

        if (!cmdLineName) {
            return prompt('Enter migration script name:', create);
        }

        var d = new Date(),
            year = d.getFullYear() + '',
            month = stringifyAndPadLeading(d.getMonth()+1),
            day = stringifyAndPadLeading(d.getDate()),
            hours = stringifyAndPadLeading(d.getHours()),
            minutes = stringifyAndPadLeading(d.getMinutes()),
            seconds = stringifyAndPadLeading(d.getSeconds()),
            dateString = year + month + day + hours +  minutes + seconds,
            fileName = '/' + dateString + (cmdLineName && cmdLineName.indexOf('--') === -1 ? '-' + cmdLineName : '') + '.js';

        fs.writeFileSync(dbMigrationsFolder + fileName, fs.readFileSync(__dirname + '/migration-skeleton.js'));
        process.exit();
    }
};

var cmdNames = Object.keys(cmds);

for ( var i = 0 ; i < cmdNames.length; i++ ) {
    if (process.argv.indexOf(cmdNames[i]) > -1) {
        return cmds[cmdNames[i]]();
    }
}

module.exports = migrateScripts;
