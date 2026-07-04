import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]

const exactSemverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const violations = []

for (const section of dependencySections) {
  const dependencies = manifest[section] ?? {}

  for (const [name, version] of Object.entries(dependencies)) {
    if (!exactSemverPattern.test(version)) {
      violations.push(`${section}.${name}: ${version}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Dependencies must use exact semver versions:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }

  process.exit(1)
}

console.log('Dependency versions are exact.')
