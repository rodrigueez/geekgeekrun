import { BrowserWindow } from 'electron'
import path from 'path'

export let jobSearchProfileWindow: BrowserWindow | null = null

export function createJobSearchProfileWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  if (jobSearchProfileWindow) {
    jobSearchProfileWindow.show()
    jobSearchProfileWindow.focus()
    return jobSearchProfileWindow
  }

  jobSearchProfileWindow = new BrowserWindow({
    width: 860,
    height: 660,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })

  jobSearchProfileWindow.on('ready-to-show', () => {
    jobSearchProfileWindow!.show()
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    jobSearchProfileWindow.loadURL(
      process.env['ELECTRON_RENDERER_URL'] + '#/jobSearchProfile'
    )
  } else {
    jobSearchProfileWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/jobSearchProfile'
    )
  }

  jobSearchProfileWindow.once('closed', () => {
    jobSearchProfileWindow = null
  })

  return jobSearchProfileWindow
}
