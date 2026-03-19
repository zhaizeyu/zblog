# zblog

这是一个基于 **VitePress** 的个人博客与文档站点，采用“项目根目录即源目录”的结构：

- `blogs/`：存放博客文章。
- `docs/`：存放技术文档。
- `.vitepress/config.mts`：站点配置。
- `scripts/content.mjs`：自动生成博客/文档侧边栏的辅助脚本。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

仓库已内置 GitHub Pages 工作流。将仓库 Pages 的 Source 设置为 **GitHub Actions** 后，推送到 `main` 或 `master` 分支即可自动部署。
