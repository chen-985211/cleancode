'use strict'

/* eslint-disable @typescript-eslint/no-require-imports */
/* global clearTimeout, process, require, setTimeout */

const { execFileSync } = require('node:child_process')
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, win32: pathWin32 } = require('node:path')

const nodePty = require('node-pty')
const { dir: conptyNativeDirectory } = require('node-pty/lib/utils').loadNativeModule('conpty')

if (!conptyNativeDirectory.replaceAll('\\', '/').includes('build/Release')) {
  throw new Error(
    `ConPTY connect failure regression must load build/Release, received ${conptyNativeDirectory}`
  )
}

const failureBatchSize = 20
const failureCount = failureBatchSize * 2
const marker = 'CLEANCODE_CONPTY_CONNECT_RECOVERED'
const directory = mkdtempSync(join(tmpdir(), 'cleancode-conpty-connect-failure-'))
const invalidPowerShell = join(directory, 'pwsh.exe')
const errors = []
const baselineHandleCount = readHandleCount()
let output = ''
let firstBatchHandleCount
let postFailureHandleCount
let preReadyExitCode
let preReadyExitCount = 0
let preReadyExitDurationMs
let preReadyKillStartedAt
let recoveredExitCode
let recoverySpawnCount = 0
let completed = false

writeFileSync(invalidPowerShell, 'not-a-portable-executable', 'utf8')

const deadline = setTimeout(() => {
  process.stderr.write('ConPTY connect failure child did not release every failed spawn resource\n')
  process.exit(1)
}, 30_000)
// Keep the watchdog referenced: once the pre-ready ConPTY sockets close, it is the
// lifecycle anchor that lets the asynchronous exit callback finish the scenario.

try {
  runFailureBatch(0)
  void waitForStableHandleCount(baselineHandleCount + 12)
    .then((handleCount) => {
      firstBatchHandleCount = handleCount
      runFailureBatch(failureBatchSize)
      return waitForStableHandleCount(firstBatchHandleCount + 4)
    })
    .then(startPreReadyShutdown)
    .catch(fail)
} catch (error) {
  fail(error)
}

function runFailureBatch(startIndex) {
  for (let offset = 0; offset < failureBatchSize; offset += 1) {
    const index = startIndex + offset
    try {
      nodePty.spawn(invalidPowerShell, [], conptyOptions())
      throw new Error(`Invalid PowerShell spawn ${index} unexpectedly succeeded`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/Cannot create process, error code: (193|216)/u.test(message)) {
        throw error
      }
      errors.push(message)
    }
  }
}

function startPreReadyShutdown(handleCount) {
  if (completed) return
  postFailureHandleCount = handleCount
  const preReady = nodePty.spawn(
    inboxWindowsPowerShell(),
    ['-NoLogo', '-NoProfile', '-Command', 'Start-Sleep -Seconds 30'],
    conptyOptions()
  )
  preReady.onExit((event) => {
    preReadyExitCount += 1
    if (preReadyExitCount !== 1) {
      fail(new Error(`Pre-ready PowerShell emitted ${preReadyExitCount} exit events`))
      return
    }
    preReadyExitCode = event.exitCode
    preReadyExitDurationMs = Date.now() - preReadyKillStartedAt
    try {
      startRecovery()
    } catch (error) {
      fail(error)
    }
  })
  preReadyKillStartedAt = Date.now()
  preReady.kill()
  preReady.destroy()
  preReady.kill()
}

function startRecovery() {
  if (completed) return
  recoverySpawnCount += 1
  const recovery = nodePty.spawn(
    inboxWindowsPowerShell(),
    ['-NoLogo', '-NoProfile', '-Command', `Write-Output '${marker}'`],
    conptyOptions()
  )
  recovery.onData((data) => {
    output += data
  })
  recovery.onExit((event) => {
    recoveredExitCode = event.exitCode
    if (!output.includes(marker)) {
      fail(new Error(`Recovery PowerShell exited before marker: ${JSON.stringify(output)}`))
      return
    }
    if (event.exitCode !== 0) {
      fail(new Error(`Recovery PowerShell exited with ${event.exitCode}`))
      return
    }
    finish()
  })
}

function finish() {
  if (completed) return
  completed = true
  clearTimeout(deadline)
  rmSync(directory, { force: true, recursive: true })
  const summary = `${JSON.stringify({
    conptyNativeDirectory,
    baselineHandleCount,
    firstBatchHandleCount,
    failureCount,
    failureMessages: [...new Set(errors)],
    nodePtyEntryPath: require.resolve('node-pty'),
    postFailureHandleCount,
    preReadyExitCode,
    preReadyExitCount,
    preReadyExitDurationMs,
    recoveredExitCode,
    recoveryMarkerObserved: output.includes(marker),
    recoverySpawnCount
  })}\n`
  process.stdout.write(summary, () => process.exit(0))
}

function waitForStableHandleCount(maximumHandleCount) {
  const expiresAt = Date.now() + 10_000
  const minimumStableAt = Date.now() + 1_200
  return new Promise((resolve, reject) => {
    let stableSamples = 0
    const inspect = () => {
      try {
        const handleCount = readHandleCount()
        stableSamples =
          Date.now() >= minimumStableAt && handleCount <= maximumHandleCount ? stableSamples + 1 : 0
        if (stableSamples >= 3) {
          resolve(handleCount)
          return
        }
        if (Date.now() >= expiresAt) {
          reject(
            new Error(
              `Failed ConPTY spawns retained Windows handles: baseline=${baselineHandleCount}, current=${handleCount}, allowed=${maximumHandleCount}`
            )
          )
          return
        }
        setTimeout(inspect, 100)
      } catch (error) {
        reject(error)
      }
    }
    inspect()
  })
}

function readHandleCount() {
  const output = execFileSync(
    inboxWindowsPowerShell(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-Process -Id ${process.pid}).HandleCount`
    ],
    { encoding: 'utf8', windowsHide: true }
  )
  const handleCount = Number.parseInt(output.trim(), 10)
  if (!Number.isInteger(handleCount)) {
    throw new Error(`Could not read Node handle count from PowerShell: ${JSON.stringify(output)}`)
  }
  return handleCount
}

function fail(error) {
  if (completed) return
  completed = true
  clearTimeout(deadline)
  rmSync(directory, { force: true, recursive: true })
  const message = `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  process.stderr.write(message, () => process.exit(1))
}

function conptyOptions() {
  return {
    cols: 80,
    cwd: directory,
    env: process.env,
    name: 'xterm-256color',
    rows: 24,
    useConpty: true,
    useConptyDll: true
  }
}

function inboxWindowsPowerShell() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const executable = pathWin32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  if (!existsSync(executable)) throw new Error(`Windows PowerShell was not found: ${executable}`)
  return executable
}
