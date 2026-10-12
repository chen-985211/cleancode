// Embedded in the relay so discovery uses the actual PTY environment, including PATH.
export const codexWindowsInvocation = String.raw`
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function resolveCodexWindowsInvocation(executable, cwd, environment) {
  const search = name => {
    const directories = /[\\/]/.test(name) ? [''] :
      (environment.PATH || environment.Path || '').split(';').filter(directory => directory.trim());
    const extensions = path.extname(name) ? [''] : ['.ps1', '.exe', '.com', '.cmd', '.bat'];
    for (const directory of directories) for (const extension of extensions) {
      const candidate = path.resolve(cwd, directory.replace(/^"|"$/g, ''), name + extension);
      try { if (statSync(candidate).isFile()) return candidate; } catch { /* Continue PATH search. */ }
    }
    return null;
  };
  try {
    let shim = search(executable);
    if (!shim) return null;
    if (/\.(exe|com)$/i.test(shim)) return { executable: shim, prefix: [] };
    if (/\.ps1$/i.test(shim)) {
      shim = shim.replace(/\.ps1$/i, '.cmd');
      if (!statSync(shim).isFile()) return null;
    }
    if (!/\.cmd$/i.test(shim)) return null;
    const text = readFileSync(shim, 'utf8').replaceAll('\r\n', '\n');
    const target = /"%dp0%\\((?:node_modules\\|\.\.\\)@openai\\codex\\bin\\codex\.js)" %\*\n$/.exec(text)?.[1];
    if (!target) return null;
    // Match the entire npm cmd-shim template, not a substring of a custom wrapper.
    // https://github.com/npm/cmd-shim/blob/main/lib/index.js
    const expected = ['@ECHO off','GOTO start',':find_dp0','SET dp0=%~dp0','EXIT /b',':start',
      'SETLOCAL','CALL :find_dp0','','IF EXIST "%dp0%\\node.exe" (','  SET "_prog=%dp0%\\node.exe"',
      ') ELSE (','  SET "_prog=node"',')','',
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\' + target + '" %*',''].join('\n');
    if (text !== expected) return null;
    const companion = shim.replace(/\.cmd$/i, '.ps1');
    if (existsSync(companion)) {
      const psTarget = target.replaceAll('\\', '/');
      const expectedPowerShell = ['#!/usr/bin/env pwsh',
        '$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent','',
        '$exe=""','if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {',
        '  # Fix case when both the Windows and Linux builds of Node',
        '  # are installed in the same directory','  $exe=".exe"','}','$ret=0',
        'if (Test-Path "$basedir/node$exe") {','  # Support pipeline input',
        '  if ($MyInvocation.ExpectingInput) {',
        '    $input | & "$basedir/node$exe"  "$basedir/' + psTarget + '" $args',
        '  } else {','    & "$basedir/node$exe"  "$basedir/' + psTarget + '" $args','  }',
        '  $ret=$LASTEXITCODE','} else {','  # Support pipeline input',
        '  if ($MyInvocation.ExpectingInput) {',
        '    $input | & "node$exe"  "$basedir/' + psTarget + '" $args',
        '  } else {','    & "node$exe"  "$basedir/' + psTarget + '" $args','  }',
        '  $ret=$LASTEXITCODE','}','exit $ret',''].join('\n');
      if (readFileSync(companion, 'utf8').replaceAll('\r\n', '\n') !== expectedPowerShell) return null;
    }
    const entry = path.resolve(path.dirname(shim), ...target.split('\\'));
    const manifest = JSON.parse(readFileSync(path.join(path.dirname(entry), '..', 'package.json'), 'utf8'));
    if (manifest.name !== '@openai/codex' || manifest.bin?.codex !== 'bin/codex.js' || !existsSync(entry)) return null;
    const localNode = path.join(path.dirname(shim), 'node.exe');
    const node = existsSync(localNode) ? localNode : search('node');
    if (!node || !/\.(exe|com)$/i.test(node)) return null;
    // Still run the official JS entrypoint: it owns platform selection, env and signals.
    return { executable: node, prefix: [entry] };
  } catch { return null; }
}

export function createCodexWindowsScriptInvocation(executable, args, argsPath) {
  const encode = value => Buffer.from(value, 'utf8').toString('base64');
  const decode = value => "[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encode(value) + "'))";
  // ASCII records keep arbitrary/empty argv out of shell syntax and preserve a short command.
  writeFileSync(argsPath, [executable, ...args].map(encode).join('\n') + '\n', {mode:0o600});
  // Use .NET primitives: JSON and pipeline helpers cold-load PowerShell's Utility module.
  const script = '$ErrorActionPreference="Stop"\n$ProgressPreference="SilentlyContinue"\n' +
    '$encoded=[IO.File]::ReadAllLines((' + decode(argsPath) + '),[Text.Encoding]::UTF8)\n' +
    '$executable=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded[0]))\n' +
    '$cli=@(Get-Command -Name $executable -CommandType Application,ExternalScript -ErrorAction Stop)[0].Path\n' +
    'if ([IO.Path]::GetExtension($cli) -eq ".cmd") {\n' +
    '  $companion=[IO.Path]::ChangeExtension($cli,".ps1")\n' +
    '  if ([IO.File]::Exists($companion)) { $cli=$companion }\n}\n' +
    '$argv=[string[]]::new($encoded.Length - 1)\n' +
    'for ($index=1; $index -lt $encoded.Length; $index++) {\n' +
    '  $argv[$index-1]=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded[$index]))\n}\n' +
    '& $cli @argv\nexit $LASTEXITCODE';
  return { executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], argsPath };
}
`
