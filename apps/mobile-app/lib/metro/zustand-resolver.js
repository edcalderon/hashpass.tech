const fs = require('fs');
const path = require('path');

const normalizeZustandSubpath = (moduleName, originModulePath, packageDir) => {
  if (moduleName === 'zustand') {
    return 'index';
  }

  if (moduleName === 'zustand/esm') {
    return 'index';
  }

  if (moduleName.startsWith('zustand/')) {
    return moduleName
      .replace(/^zustand\/esm\//, '')
      .replace(/^zustand\//, '')
      .replace(/\.(mjs|js)$/i, '');
  }

  if (!originModulePath || !packageDir || !moduleName.startsWith('.')) {
    return null;
  }

  const esmRoot = path.join(packageDir, 'esm');
  const normalizedOriginPath = path.normalize(originModulePath);
  if (!normalizedOriginPath.startsWith(`${esmRoot}${path.sep}`)) {
    return null;
  }

  const resolvedPath = path.normalize(path.resolve(path.dirname(normalizedOriginPath), moduleName));

  if (!resolvedPath.startsWith(`${esmRoot}${path.sep}`)) {
    return null;
  }

  return path
    .relative(esmRoot, resolvedPath)
    .replace(/\.(mjs|js)$/i, '');
};

const resolveZustandCommonJs = (moduleName, packageDir, originModulePath) => {
  if (!packageDir) {
    return null;
  }

  const subPath = normalizeZustandSubpath(moduleName, originModulePath, packageDir);
  if (!subPath) {
    return null;
  }

  const candidates = [
    path.join(packageDir, `${subPath}.js`),
    path.join(packageDir, subPath, 'index.js'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

module.exports = {
  normalizeZustandSubpath,
  resolveZustandCommonJs,
};
