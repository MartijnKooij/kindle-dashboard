// process.env.debug = true;

// The module type must be commonjs for local dev but module for lambda deploy.
const runner = require('./dist/index.js');

runner.kindleDashboardImage();
