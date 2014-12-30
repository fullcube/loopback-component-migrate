A library to add simple database migration support to loopback projects.
Migrations that have been run will be stored in a table called 'Migrations'.
The library will read the loopback datasources.json files based on the NODE_ENV environment variable just like loopback does.
The usage is based on the node-db-migrate project.

<strong>NOTE: This does not currently work with the loopback in memory DB.</strong>

<h2>CLI Usage</h2>
```
loopback-db-migrate [up|down|create] [options]

Down migrations are run in reverse run order.

Options:
  --database specify database name (optional, default: db)
  --since specify date to run migrations from (options, default: run all migrations)
```

<h2>Using the CLI directly</h2>
Run all new migrations that have not previously been run, using datasources.json and database 'db':
```javascript
node node_modules/loopback-db-migrate/loopback-db-migrate.js up
```

Run all new migrations since 01012014 that have not previously been run, using datasources.json and datasources.qa.json and database 'my_db_name':
```javascript
NODE_ENV=qa node node_modules/loopback-db-migrate/loopback-db-migrate.js up --database my_db_name --since 01012014
```

<h2>Using the CLI with npm by updating your package.json</h2>:
```javascript
"scripts": {
  "migrate-db-up": "loopback-db-migrate up --database some_db_name",
  "migrate-db-down": "loopback-db-migrate down --database some_db_name"
}

npm run-script migrate-db-up
npm run-script migrate-db-down

NODE_ENV=production npm run-script migrate-db-up
NODE_ENV=production npm run-script migrate-db-down
```
