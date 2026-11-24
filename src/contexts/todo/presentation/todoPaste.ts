import { httpLink } from '../domain/ProjectTodoList'

function clipboardUrl(candidate: string) {
  const text = candidate.trim()
  if (!text || /\s/.test(text)) return null
  return (
    httpLink(text) ??
    (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text)
      ? httpLink('https://' + text)
      : null)
  )
}
export function classifyTodoPaste(text: string, uriList: string, htmlLinks: string[] = []) {
  const urls = new Set<string>()
  const add = (value: string) => {
    const url = clipboardUrl(value)
    if (url) urls.add(url)
  }
  uriList
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .forEach(add)
  htmlLinks.forEach(add)
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const onlyLinks = tokens.length > 0 && tokens.every((token) => clipboardUrl(token))
  if (onlyLinks) tokens.forEach(add)
  else
    for (const [match] of text.matchAll(
      /\b(?:https?:\/\/|www\.)[^\s<>"'，。；！？、（）【】]+/gi
    )) {
      let url = match.replace(/[.,!?:;]+$/, '')
      while (url.endsWith(')') && url.split(')').length > url.split('(').length)
        url = url.slice(0, -1)
      add(url)
    }
  return { text: onlyLinks ? '' : text, links: [...urls] }
}
