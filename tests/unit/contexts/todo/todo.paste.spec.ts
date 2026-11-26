import {
  classifyTodoPaste,
  numberedTodoLines
} from '../../../../src/contexts/todo/presentation/todoPaste'
describe('to-do clipboard', () => {
  it.each([
    ['1. first\r\n2. second', ['first', 'second']],
    ['1、画布\n\n2）侧栏', ['画布', '侧栏']],
    ['1.单条', []],
    ['first\nsecond', []],
    ['1. first\n3. third', []],
    ['1.23\n2.45', []],
    ['1. first\n说明\n2. second', []]
  ] as const)('recognizes a complete consecutive numbered list in %s', (text, lines) => {
    expect(numberedTodoLines(text)).toEqual(lines)
  })
  it.each([
    ['保留这段话', '保留这段话', []],
    ['www.example.org', '', ['https://www.example.org/']],
    [
      '调整间距，参考 https://example.org/ui。',
      '调整间距，参考 https://example.org/ui。',
      ['https://example.org/ui']
    ],
    [
      'https://example.org/a\nhttps://example.org/b',
      '',
      ['https://example.org/a', 'https://example.org/b']
    ],
    ['javascript:alert(1)', 'javascript:alert(1)', []]
  ])('recognizes %s without losing the description', (input, text, links) => {
    expect(classifyTodoPaste(String(input), '')).toEqual({ text, links })
  })
})
