A library to add simple database migration support to loopback projects.

[![Dependencies](http://img.shields.io/david/fullcube/loopback-db-migrate.svg?style=flat)](https://david-dm.org/fullcube/loopback-db-migrate) [![Circle CI](https://circleci.com/gh/fullcube/loopback-db-migrate.svg?style=svg)](https://circleci.com/gh/fullcube/loopback-db-migrate)

Migrations that have been run will be stored in a table called 'Migrations'.
The library will read the loopback datasources.json files based on the NODE_ENV environment variable just like loopback does.
The usage is based on the node-db-migrate project.


## Configuration

To initialize, add the following in server.js or a boot script:

```javascript
var migrate = require('loopback-db-migrate');
var options = {
  dataSource: ds, // Data source for migrate data persistence (defaults to 'db'),
  migrationsDir: path.join(__dirname, 'migrations'), // Migrations directory.
  enableRest: true // Expose migrate and rollback methods via REST api.
};
migrate(
  app, // The app instance
  options // The options
);
```

## Running Migrations

Migrations can be run by calling the static `migrate` method on the Migration model. If you do not specify a callback, a promise will be returned.

**Run all pending migrations:**
```javascript
Migrate.migrate('up', function(err) {});
```

**Run all pending migrations upto and including 0002-somechanges:**
```javascript
Migrate.migrate('up', '0002-somechanges', function(err) {});
```

**Rollback all migrations:**
```javascript
Migrate.migrate('down', function(err) {});
```

**Rollback migrations upto and including 0002-somechanges:**
```javascript
Migrate.migrate('down', '0002-somechanges', function(err) {});
```

## Example migrations
```javascript
module.exports = {
  up: function(app, next) {
    app.models.Users.create({ ... }, next);
  },
  down: function(app, next) {
    app.models.Users.destroyAll({ ... }, next);
  }
};
```

```javascript
/* executing raw sql */
module.exports = {
  up: function(app, next) {
    app.dataSources.mysql.connector.query('CREATE TABLE `my_table` ...;', next);
  },
  down: function(app, next) {
   app.dataSources.mysql.connector.query('DROP TABLE `my_table`;', next);
  }
};
```
