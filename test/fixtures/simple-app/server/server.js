var loopback = require('loopback');
var boot = require('loopback-boot');
var path = require('path');

var app = module.exports = loopback();

var ds = app.loopback.createDataSource({
  connector: 'memory'
});

var migrate = require(path.join(__dirname, '..', '..', '..', '..', 'lib'));
var options = {
  dataSource: ds, // Data source for migrate data persistence,
  migrationsDir: path.join(__dirname, 'migrations') // Migrations directory.
};
migrate(
  app, // The app instance
  options // The options
);

app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit('started');
    console.log('Web server listening at: %s', app.get('url'));
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
