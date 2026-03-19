---
layout: home

hero:
  name: '我的知识库'
  text: '记录技术、部署与每日观察'
  tagline: 使用 VitePress 统一管理博客与文档，保留清晰的内容分区与可扩展结构。
  actions:
    - theme: brand
      text: 阅读博客
      link: /blogs/
    - theme: alt
      text: 查看文档
      link: /docs/getting-started

features:
  - icon: 📝
    title: 博客与文档分离
    details: blogs 用于内容发布，docs 用于沉淀教程与技术说明，目录层级更加清晰。
  - icon: ⚙️
    title: 自动生成侧边栏
    details: VitePress 在启动和构建时会自动扫描 blogs 与 docs 目录，无需手动维护 sidebar。
  - icon: 🚀
    title: 开箱即用部署
    details: 已内置 GitHub Pages 工作流，推送到主分支即可自动构建与发布。
---
