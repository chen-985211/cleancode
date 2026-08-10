'use strict'

/* eslint-disable @typescript-eslint/no-require-imports */
/* global clearInterval, clearTimeout, process, require, setInterval, setTimeout */

const nodePty = require('node-pty')
const { dir: conptyNativeDirectory } = require('node-pty/lib/utils').loadNativeModule('conpty')

if (!conptyNativeDirectory.replaceAll('\\', '/').includes('build/Release')) {
  throw new Error(
    `ConPTY close race must load a rebuilt native module from build/Release, received ${conptyNativeDirectory}`
  )
}

const terminalCount = 30
const deadlineMs = 60_000
const readyPrefix = 'CLEANCODE_CONPTY_CLOSE_RACE_READY_'
const terminals = []
const outputTails = Array.from({ length: terminalCount }, () => '')
const readyFlags = Array.from({ length: terminalCount }, () => false)
const exitCounts = Array.from({ length: terminalCount }, () => 0)

let readyCount = 0
let exitedCount = 0
let resizeAttemptCount = 0
let clearAttemptCount = 0
let successfulResizeCount = 0
let successfulClearCount = 0
let killAttemptCount = 0
let dimensionTick = 0
let raceStarted = false
let raceCompleted = false
let failureReported = false
let summaryReported = false
let raceInterval
let failureDrainDeadline

const deadline = setTimeout(() => {
  fail(
    new Error(
      `ConPTY close race timed out: ready=${readyCount}/${terminalCount}, exited=${exitedCount}/${terminalCount}`
    )
  )
}, deadlineMs)

process.once('beforeExit', () => {
  if (failureReported || summaryReported) {
    return
  }
  if (!raceCompleted) {
    fail(new Error('ConPTY close race child became idle before every terminal exited'))
    return
  }

  const duplicateExitCount = exitCounts.reduce((total, count) => total + Math.max(0, count - 1), 0)
  if (duplicateExitCount !== 0) {
    fail(new Error(`ConPTY close race emitted ${duplicateExitCount} duplicate exit event(s)`))
    return
  }

  summaryReported = true
  process.stdout.write(
    `${JSON.stringify({
      terminalCount,
      readyCount,
      exitedCount,
      duplicateExitCount,
      resizeAttemptCount,
      clearAttemptCount,
      successfulResizeCount,
      successfulClearCount,
      conptyNativeDirectory,
      killAttemptCount,
      nodePtyEntryPath: require.resolve('node-pty')
    })}\n`
  )
})

try {
  for (let index = 0; index < terminalCount; index += 1) {
    // This is the upstream race victim, not a product shell fallback.
    const terminal = nodePty.spawn('cmd.exe', ['/d', '/q'], {
      cols: 80,
      cwd: process.cwd(),
      env: process.env,
      name: 'xterm-256color',
      rows: 24,
      useConpty: true,
      useConptyDll: true
    })
    terminals.push(terminal)

    terminal.onData((data) => {
      if (readyFlags[index]) {
        return
      }

      outputTails[index] = `${outputTails[index]}${data}`.slice(-2_048)
      if (!outputTails[index].includes(`${readyPrefix}${index}`)) {
        return
      }

      readyFlags[index] = true
      readyCount += 1
      if (readyCount === terminalCount) {
        startRace()
      }
    })
    terminal.onExit(() => {
      exitCounts[index] += 1
      if (exitCounts[index] > 1) {
        fail(new Error(`ConPTY terminal ${index} emitted exit more than once`))
        return
      }

      exitedCount += 1
      if (failureReported) {
        finishFailureIfDrained()
        return
      }
      if (exitedCount === terminalCount) {
        raceCompleted = true
        clearTimeout(deadline)
        if (raceInterval !== undefined) {
          clearInterval(raceInterval)
          raceInterval = undefined
        }
      }
    })
    terminal.write(`echo ${readyPrefix}${index}\r`)
  }
} catch (error) {
  fail(error)
}

function startRace() {
  if (raceStarted || failureReported) {
    return
  }
  raceStarted = true

  if (!exerciseResizeAndClear(true)) {
    return
  }
  raceInterval = setInterval(() => exerciseResizeAndClear(false), 1)
  for (const terminal of terminals) {
    killAttemptCount += 1
    try {
      terminal.kill()
    } catch {
      // Another native watcher may have already completed this terminal.
    }
  }
}

function exerciseResizeAndClear(failOnError) {
  dimensionTick += 1
  for (const [index, terminal] of terminals.entries()) {
    resizeAttemptCount += 1
    try {
      terminal.resize(80 + (dimensionTick % 40), 24 + (dimensionTick % 20))
      successfulResizeCount += 1
    } catch (error) {
      if (failOnError) {
        fail(new Error(`Initial resize failed for terminal ${index}: ${formatError(error)}`))
        return false
      }
    }

    clearAttemptCount += 1
    try {
      terminal.clear()
      successfulClearCount += 1
    } catch (error) {
      if (failOnError) {
        fail(new Error(`Initial clear failed for terminal ${index}: ${formatError(error)}`))
        return false
      }
    }
  }
  return true
}

function fail(error) {
  if (failureReported) {
    return
  }
  failureReported = true
  clearTimeout(deadline)
  if (raceInterval !== undefined) {
    clearInterval(raceInterval)
    raceInterval = undefined
  }

  for (const terminal of terminals) {
    try {
      terminal.kill()
    } catch {
      // Best-effort cleanup before the isolated process terminates.
    }
  }

  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`${message}\n`)
  if (terminals.length === 0 || exitedCount >= terminals.length) {
    finishFailureIfDrained()
    return
  }
  failureDrainDeadline = setTimeout(() => process.exit(1), 5_000)
}

function finishFailureIfDrained() {
  if (!failureReported || exitedCount < terminals.length) {
    return
  }
  if (failureDrainDeadline !== undefined) {
    clearTimeout(failureDrainDeadline)
    failureDrainDeadline = undefined
  }
  process.exitCode = 1
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}
