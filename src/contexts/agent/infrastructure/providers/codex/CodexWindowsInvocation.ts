// Embedded in the relay so discovery uses the actual PTY environment, including PATH.
export const codexWindowsInvocation = String.raw`
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function resolveCodexWindowsInvocation(executable, cwd, environment) {
  const search = name => {
    const directories = /[\\/]/.test(name) ? [''] : [cwd, ...(environment.PATH || environment.Path || '').split(';')];
    const extensions = path.extname(name) ? [''] : ['.exe', '.com', '.cmd', '.bat'];
    for (const directory of directories) for (const extension of extensions) {
      const candidate = path.resolve(cwd, directory.replace(/^"|"$/g, ''), name + extension);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };
  try {
    const shim = search(executable);
    if (!shim || !/\.cmd$/i.test(shim)) return null;
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
`
