import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
const javaBinary = (home) => join(home, 'bin', windows ? 'java.exe' : 'java');
const candidates = [
  process.env.JAVA_HOME,
  ...(windows ? [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    'C:\\Program Files\\Android\\Android Studio1\\jbr',
  ] : [
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ]),
].filter(Boolean);

function javaMajor(home) {
  if (!existsSync(javaBinary(home))) return 0;
  const result = spawnSync(javaBinary(home), ['-version'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (!match) return 0;
  return Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
}

const javaHome = candidates.find((candidate) => javaMajor(candidate) >= 21);
if (!javaHome) {
  console.error('Android debug builds require JDK 21 or newer. Configure Android Studio Embedded JDK or JAVA_HOME.');
  process.exit(1);
}

const androidDirectory = join(process.cwd(), 'android');
const gradle = join(androidDirectory, windows ? 'gradlew.bat' : 'gradlew');
const result = spawnSync(gradle, ['assembleDebug'], {
  cwd: androidDirectory,
  env: { ...process.env, JAVA_HOME: javaHome },
  stdio: 'inherit',
  shell: windows,
});

process.exit(result.status ?? 1);
