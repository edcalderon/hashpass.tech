import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('Expo prebuild targets Android 16 consistently for compile and Play submission', () => {
  const result = execFileSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const config = JSON.parse(result.slice(result.indexOf('{')));
  const properties = config._internal.modResults.android.gradleProperties;
  for (const key of ['android.compileSdkVersion', 'android.targetSdkVersion']) {
    expect(properties.filter((entry: { key: string }) => entry.key === key).map((entry: { value: string }) => entry.value)).toEqual(['36']);
  }
}, 35000);

test('replaces stale SDK properties once and preserves unrelated Gradle configuration', () => {
  const expoRoot = path.dirname(require.resolve('expo/package.json'));
  const plugins = require.resolve('@expo/config-plugins', { paths: [expoRoot] });
  jest.doMock(plugins, () => ({ withGradleProperties: (config: unknown, apply: (value: unknown) => unknown) => apply(config) }));
  const withAndroidTargetSdk = require('../../plugins/withAndroidTargetSdk');
  const config = { modResults: [
    { type: 'property', key: 'android.compileSdkVersion', value: '35' },
    { type: 'property', key: 'android.targetSdkVersion', value: '35' },
    { type: 'property', key: 'android.targetSdkVersion', value: '34' },
    { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
  ] };
  const first = withAndroidTargetSdk(config);
  expect(withAndroidTargetSdk(first).modResults).toEqual([
    { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
    { type: 'property', key: 'android.compileSdkVersion', value: '36' },
    { type: 'property', key: 'android.targetSdkVersion', value: '36' },
  ]);
});
