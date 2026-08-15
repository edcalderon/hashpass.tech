const README_GUARD_BYPASS_ENV = 'HASHPASS_SKIP_README_GUARD';

function isReadmeGuardBypassed(argv = [], env = process.env) {
  return Array.isArray(argv) && argv.includes('--allow-stale') || env?.[README_GUARD_BYPASS_ENV] === '1';
}

module.exports = {
  README_GUARD_BYPASS_ENV,
  isReadmeGuardBypassed,
};
