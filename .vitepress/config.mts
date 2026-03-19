import { defineConfig } from 'vitepress'
import { buildBlogCategoryGroups, buildBlogYearGroups, buildDocsSidebar } from '../scripts/content.mjs'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.SITE_BASE
  ?? (process.env.GITHUB_ACTIONS === 'true' && repositoryName ? `/${repositoryName}/` : '/')

const blogCategories = buildBlogCategoryGroups()
const blogArchives = buildBlogYearGroups()
const docsSidebar = buildDocsSidebar()

export default defineConfig({
  lang: 'zh-CN',
  title: '我的知识库',
  description: '基于 VitePress 的文档与博客站点',
  base,
  srcExclude: ['**/README.md', '**/TODO.md'],
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '博客', link: '/blogs/' },
      { text: '文档', link: '/docs/getting-started' },
      { text: 'GitHub', link: 'https://github.com/zhaizeyu/zblog' }
    ],
    sidebar: {
      '/blogs/': [
        {
          text: '博客导览',
          items: [
            { text: '博客首页', link: '/blogs/' }
          ]
        },
        ...blogCategories,
        ...blogArchives
      ],
      '/docs/': docsSidebar
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/zhaizeyu/zblog' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: '由 VitePress 驱动，博客侧边栏由脚本自动生成。',
      copyright: 'Copyright © 2026 zblog'
    }
  }
})
