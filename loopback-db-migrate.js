#!/usr/bin/env node
'use strict';

var dbName = process.argv[process.argv.indexOf('--name') + 1] || 'db',
    datasource = require(process.cwd() + '/server/server.js').dataSources[dbName];

datasource.createModel('Migration', {
    "name": {
        "id": true,
        "type": "String",
        "required": true,
        "index": {
            "unique": true
        }
    },
    "runDtTm": {
        "type": "Date",
        "required": true
    }
});


// create table if not exists
datasource.autoupdate('Migration', function(){
    datasource.models.Migration.find(function(err, results){
        if (err) {
            console.log('Error retrieving migrations:');
            return console.log(err.stack);
        }

        console.log(results);
    })
});