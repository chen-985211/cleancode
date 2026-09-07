/** Embedded in the relay so temporary Windows sharing locks cannot terminate the TUI. */
export const codexNativeMessageFiles = String.raw`
const publish = async (path, value) => {
  const temporary = path + '.tmp-' + randomBytes(12).toString('hex');
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); return; }
      catch (error) {
        if (process.platform !== 'win32' || attempt >= 5 ||
            !['EACCES', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
      }
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
};
`
