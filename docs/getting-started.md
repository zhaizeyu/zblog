# 快速开始

本仓库已经迁移为「项目根目录就是 VitePress 源目录」的结构，因此你可以直接在根目录下维护站点内容。

## 目录说明

```text
.
├── .vitepress/        # VitePress 配置
├── blogs/             # 博客文章
├── docs/              # 技术文档
├── scripts/           # 自动生成侧边栏等辅助脚本
└── index.md           # 网站首页
```

## 本地开发

```bash
npm install
npm run dev
```

启动后访问默认地址 `http://localhost:5173` 即可预览。

## 新增博客

1. 在 `blogs/` 下选择一个分类目录。
2. 新建 Markdown 文件，并写上一级标题。
3. 重新启动或刷新开发服务器，侧边栏会自动更新。
