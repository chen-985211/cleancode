export const outputReadinessCases = [
  { name: 'plain text', text: 'Local:', output: 'server Local: http://localhost/' },
  {
    name: 'Vite bold label and reset before colon',
    text: 'Local:',
    output: '\x1b[32m➜\x1b[0m  \x1b[1mLocal\x1b[22m: http://localhost/'
  },
  {
    name: 'truecolor within the marker',
    text: 'Local:',
    output: 'Lo\x1b[38;2;10;20;30mca\x1b[0ml:'
  },
  {
    name: 'OSC hyperlink label',
    text: 'Local:',
    output: '\x1b]8;;https://example.test\x1b\\Lo\x1b]8;;\x1b\\cal:'
  },
  {
    name: 'OSC title terminated by BEL',
    text: 'Local:',
    output: 'Loc\x1b]0;dev server\x07al:'
  },
  { name: 'C1 CSI and OSC', text: 'Local:', output: '\x9d0;title\x9cLo\x9b1mcal\x9b0m:' },
  { name: 'ESC charset selection', text: 'Local:', output: 'Loc\x1b(Bal:' },
  { name: 'Unicode and literal punctuation', text: '就绪🚀[ok].', output: '就绪\x1b[1m🚀[ok].' },
  { name: 'overlapping prefixes', text: 'aab', output: 'aa\x1b[32maab' }
]
