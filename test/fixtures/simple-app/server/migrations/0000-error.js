module.exports = {
  up: function(dataSource, next) {
    process.nextTick(() => next(new Error('some error in up')))
  },
  down: function(dataSource, next) {
    process.nextTick(() => next())
  }
};
