const coverageConfig = require('./jest.coverage.config.cjs');

module.exports = {
  ...coverageConfig,
  collectCoverage: false,
};
