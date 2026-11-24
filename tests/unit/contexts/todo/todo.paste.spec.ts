import { classifyTodoPaste } from '../../../../src/contexts/todo/presentation/todoPaste'
describe('to-do clipboard', () => {
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
