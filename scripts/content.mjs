import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BLOGS_DIR = path.join(ROOT, 'blogs')
const DOCS_DIR = path.join(ROOT, 'docs')

function walkMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      return walkMarkdownFiles(fullPath)
    }

    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'index.md') {
      return []
    }

    return [fullPath]
  })
}

function normalizeLink(fullPath) {
  return `/${path.relative(ROOT, fullPath).replace(/\\/g, '/').replace(/\.md$/, '')}`
}

function fileToTitle(fullPath) {
  const content = fs.readFileSync(fullPath, 'utf8')
  const heading = content.match(/^#\s+(.+)$/m)

  if (heading) {
    return heading[1].trim()
  }

  return path.basename(fullPath, '.md')
}

function groupBy(items, keyFactory) {
  return items.reduce((groups, item) => {
    const key = keyFactory(item)
    groups[key] ??= []
    groups[key].push(item)
    return groups
  }, {})
}

function sortByLinkDesc(items) {
  return items.sort((a, b) => b.link.localeCompare(a.link, 'zh-CN'))
}

function sortByLinkAsc(items) {
  return items.sort((a, b) => a.link.localeCompare(b.link, 'zh-CN'))
}

function getBlogEntries() {
  return walkMarkdownFiles(BLOGS_DIR).map((fullPath) => {
    const relative = path.relative(BLOGS_DIR, fullPath).replace(/\\/g, '/')
    const segments = relative.split('/')
    const category = segments.length > 1 ? segments[0] : '未分类'
    const yearCandidate = segments.find((segment) => /^\d{4}$/.test(segment))
    const year = yearCandidate ?? '其他'

    return {
      title: fileToTitle(fullPath),
      link: normalizeLink(fullPath),
      category,
      year
    }
  })
}

function getDocsEntries() {
  return walkMarkdownFiles(DOCS_DIR).map((fullPath) => ({
    title: fileToTitle(fullPath),
    link: normalizeLink(fullPath)
  }))
}

export function buildBlogCategoryGroups() {
  const entries = getBlogEntries()
  const grouped = groupBy(entries, (entry) => entry.category)

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
    .map(([category, items]) => ({
      text: category,
      collapsed: false,
      items: sortByLinkDesc(items).map(({ title, link }) => ({ text: title, link }))
    }))
}

export function buildBlogYearGroups() {
  const entries = getBlogEntries().filter((entry) => entry.year !== '其他')
  const grouped = groupBy(entries, (entry) => entry.year)

  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a, 'zh-CN'))
    .map(([year, items]) => ({
      text: `${year} 年归档`,
      collapsed: true,
      items: sortByLinkDesc(items).map(({ title, link }) => ({ text: title, link }))
    }))
}

export function buildDocsSidebar() {
  const entries = getDocsEntries()

  return [
    {
      text: '文档导航',
      collapsed: false,
      items: [
        { text: '快速开始', link: '/docs/getting-started' },
        ...sortByLinkAsc(entries).map(({ title, link }) => ({ text: title, link }))
      ].filter((item, index, items) => items.findIndex((candidate) => candidate.link === item.link) === index)
    }
  ]
}
