import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', XDG_CONFIG_HOME: resolve(root, '.firebase-local-config') };
// Windows Java NIO needs a short native TEMP path for its Unix-domain wakeup pipe.
if (process.platform === 'win32' && existsSync('C:\\CodexHome\\tmp')) {
  env.TEMP = 'C:\\CodexHome\\tmp'; env.TMP = env.TEMP;
}
const androidJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const localJdkDir = resolve(root, 'tools', 'temurin21');
const localJdk = existsSync(localJdkDir) ? readdirSync(localJdkDir).find(x => x.startsWith('jdk-21')) : null;
if (!env.JAVA_HOME && localJdk) env.JAVA_HOME = resolve(localJdkDir, localJdk);
if (!env.JAVA_HOME && existsSync(resolve(androidJbr, 'bin', 'java.exe'))) env.JAVA_HOME = androidJbr;
env.PATH = `${dirname(process.execPath)};${env.PATH}`;
if (env.JAVA_HOME) env.PATH = `${resolve(env.JAVA_HOME, 'bin')};${env.PATH}`;
const cli = resolve(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const testFile = process.argv[2] || 'tests/firebase-emulator.test.js';
if (!/^tests\/(?:firebase-(?:emulator|browser)|worker-emulator)\.test\.js$/.test(testFile)) throw new Error('Unsupported emulator test file');
const only = testFile === 'tests/worker-emulator.test.js' ? 'firestore' : 'auth,firestore,functions';
const child = spawn(process.execPath, [cli, 'emulators:exec', '--project', 'demo-1math3-checkpoint3', '--only', only, '--log-verbosity', 'QUIET', `"${process.execPath}" --test ${testFile}`], { cwd: root, env, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
