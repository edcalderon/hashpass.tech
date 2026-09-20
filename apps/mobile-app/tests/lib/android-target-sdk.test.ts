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
