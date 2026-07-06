const fs = require('fs');
const path = require('path');

const resolveDreiCommonJs = (moduleName, packageDir) => {
  if (!packageDir || !moduleName.startsWith('@react-three/drei')) {
    return null;
  }

  if (moduleName === '@react-three/drei') {
    const entryPath = path.join(packageDir, 'index.cjs.js');
    return fs.existsSync(entryPath) ? entryPath : null;
  }

  const subPath = moduleName
    .slice('@react-three/drei/'.length)
    .replace(/\.(mjs|js)$/i, '');

  const candidates = [
    path.join(packageDir, `${subPath}.cjs.js`),
    path.join(packageDir, `${subPath}.js`),
    path.join(packageDir, subPath, 'index.cjs.js'),
    path.join(packageDir, subPath, 'index.js'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

module.exports = {
  resolveDreiCommonJs,
};
