import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'node:url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const uiDir = path.resolve(__dirname, '..')
const realHome = os.homedir()
const devHome =
  process.env.GEEKGEEKRUN_DEV_HOME ||
  path.join(realHome, '.geekgeekrun-dev', 'home')
const userDataDir =
  process.env.GEEKGEEKRUN_DEV_USER_DATA_DIR ||
  path.join(realHome, '.geekgeekrun-dev', 'user-data')

for (const dir of [
  devHome,
  path.join(devHome, '.geekgeekrun', 'config'),
  path.join(devHome, '.geekgeekrun', 'storage'),
  path.join(devHome, '.geekgeekrun', 'log'),
  path.join(devHome, '.geekgeekrun', 'cache'),
  userDataDir
]) {
  fs.mkdirSync(dir, { recursive: true })
}

const electronViteBin = path.join(
  uiDir,
  process.platform === 'win32'
    ? '../../node_modules/.bin/electron-vite.cmd'
    : '../../node_modules/.bin/electron-vite'
)

const child = spawn(electronViteBin, ['dev'], {
  cwd: uiDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    HOME: devHome,
    USERPROFILE: devHome,
    GEEKGEEKRUN_DEV_USER_DATA_DIR: userDataDir
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
