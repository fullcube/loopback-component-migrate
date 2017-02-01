module.exports = {
  up: function(dataSource, next) {
    process.nextTick(() => next())
  },
  down: function(dataSource, next) {
    process.nextTick(() => next())
  }
};
