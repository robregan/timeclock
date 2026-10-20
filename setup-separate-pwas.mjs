// Run once at the project root: node setup-separate-pwas.mjs
// Preserves existing index.html metadata and copies it as the manager HTML entry.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const rootIndex = join(root, 'index.html')
const managerDir = join(root, 'manager')
const managerIndex = join(managerDir, 'index.html')

if (!existsSync(rootIndex)) {
  throw new Error('Run this script from your project root (where index.html lives).')
}

function makeEntry(html, name, manifestHref) {
  if (!/<\/head>/i.test(html)) throw new Error('Could not find the closing </head> tag.')
  if (!/<script\b[^>]+src\s*=\s*["'](?:\/|\.\/)?src\/main\.jsx["']/i.test(html)) {
    throw new Error('Expected Vite entry script src="/src/main.jsx" in index.html. No files changed.')
  }

  // Strip existing manifest links; the PWA plugin will not inject one.
  html = html.replace(/<link\b[^>]*>/gi, tag => /\brel\s*=\s*["']manifest["']/i.test(tag) ? '' : tag)

  // Ensure the JS entry is root-relative, including when the HTML is under /manager/.
  html = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'])(?:\/|\.\/)?src\/main\.jsx(["'])/gi,
    '$1/src/main.jsx$2')

  const manifestTag = `  <link rel="manifest" href="${manifestHref}" />\n`
  html = html.replace(/<\/head>/i, `${manifestTag}</head>`)
  if (/<title>.*?<\/title>/is.test(html)) {
    html = html.replace(/<title>.*?<\/title>/is, `<title>${name}</title>`)
  } else {
    html = html.replace(/<\/head>/i, `  <title>${name}</title>\n</head>`)
  }
  return html
}

const original = readFileSync(rootIndex, 'utf8')
const employee = makeEntry(original, 'ShiftClock Employee', '/employee.webmanifest')
const manager = makeEntry(original, 'ShiftClock Manager', '/manager.webmanifest')
mkdirSync(managerDir, { recursive: true })
writeFileSync(rootIndex, employee)
writeFileSync(managerIndex, manager)
console.log('Created separate PWA HTML pages: index.html and manager/index.html')
