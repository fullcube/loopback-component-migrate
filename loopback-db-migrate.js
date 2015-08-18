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

datasource.createModel('Migration', {
    "name": {
        "id": true,
        "type": "String",
        "required": true,
        "length": 100
    },
    "db": {
        "type": "String",
        "length": 100,
        "required": true
    },
    "runDtTm": {
        "type": "Date",
        "required": true
    }
});

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

function findScriptsToRun(upOrDown, cb) {
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
            console.log('Error retrieving migrations:');
            console.log(err.stack);
            process.exit(1);
        }

        // get all scripts that have been run from DB
        datasource.models.Migration.find(filters, function (err, scriptsRun) {
            if (err) {
                console.log('Error retrieving migrations:');
                console.log(err.stack);
                process.exit(1);
            }

            if (upOrDown === 'up') {
                var runScriptsNames = scriptsRun.map(mapScriptObjName);

                // return scripts that exist on disk but not in the db
                cb(localScriptNames.filter(function (scriptName) {
                    return runScriptsNames.indexOf(scriptName) < 0;
                }));
            } else {
                // return all db script names
                cb(scriptsRun.map(mapScriptObjName));
            }
        });
    });
}

function migrateScripts(upOrDown) {
    return function findAndRunScripts() {
        findScriptsToRun(upOrDown, function runScripts(scriptsToRun) {
            var migrationCallStack = [],
                migrationCallIndex = 0;

            scriptsToRun.forEach(function (localScriptName) {
                migrationCallStack.push(function () {

                    // keep calling scripts recursively until we are done, then exit
                    function runNextScript(err) {
                        if (err) {
                            console.log('Error saving migration', localScriptName, 'to database!');
                            console.log(err.stack);
                            process.exit(1);;
                        }

                        console.log(localScriptName, 'finished sucessfully.');
                        migrationCallIndex++;
                        if (migrationCallIndex < migrationCallStack.length) {
                            migrationCallStack[migrationCallIndex]();
                        } else {
                            process.exit();
                        }
                    }

                    try {
                        // include the script, run the up/down function, update the migrations table, and continue
                        console.log(localScriptName, 'running.');
                        require(dbMigrationsFolder + '/' + localScriptName)[upOrDown](datasource, function (err) {
                            if (err) {
                                console.log(localScriptName, 'error:');
                                console.log(err.stack);
                                process.exit(1);
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
                    } catch (e) {
                        console.log('Error running migration', localScriptName);
                        console.log(e.stack);
                        process.exit(1);
                    }
                });
            });

            // kick off recursive calls
            if (migrationCallStack.length) {
                migrationCallStack[migrationCallIndex]();
            } else {
                console.log('No new migrations to run.');
                process.exit();
            }
        });
    }
}

function stringifyAndPadLeading(num) {
    var str = num + '';
    return (str.length === 1) ? '0' + str : str;
}

var cmds = {
    up: migrateScripts('up'),
    down: migrateScripts('down'),
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
