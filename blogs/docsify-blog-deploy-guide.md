# 全自动 Docsify 博客搭建指南 (GitHub Pages + Actions)

这份指南集成了权限管理、子目录 404 修复、自动化分类侧边栏等实战方案，助你打造一个“写完即发布”的知识库。

## 一、 核心架构
- **前端**: Docsify (直接渲染 Markdown，无需构建)
- **托管**: GitHub Pages (免费静态托管)
- **自动化**: GitHub Actions (自动维护 `_sidebar.md` 与 `.nojekyll`)

## 二、 仓库初始化与权限
1. **创建仓库**: 新建 Public 仓库（如 `zblog`）。
2. **关键设置 (必做)**:
   - 进入 `Settings` -> `Actions` -> `General`。
   - 滚动到底部 **Workflow permissions**。
   - 勾选 **Read and write permissions** 并保存。*（否则 Action 无法自动更新目录）*

## 三、 目录结构
```text
zblog/
├── .github/workflows/
│   └── docsify-sidebar.yml  # 自动化脚本
├── blogs/                   # 存放文章的目录
├── index.html               # 网站入口配置
├── README.md                # 网站首页
└── .nojekyll                # 防止 GitHub 屏蔽下划线文件
```

## 四、 核心配置文件

### 1. 入口文件 index.html
集成了搜索、代码高亮及子目录路径修复。
```html
<!DOCTYPE html>
<html lang="zh-cn">
<head>
  <meta charset="UTF-8">
  <title>我的博客</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify@4/lib/themes/vue.css">
</head>
<body>
  <div id="app">加载中...</div>
  <script>
    window.$docsify = {
      name: 'zblog',
      repo: 'zhaizeyu/zblog',
      loadSidebar: true,
      autoHeader: true,
      subMaxLevel: 2,
      alias: { '/.*/_sidebar.md': '/_sidebar.md' }, // 修复子目录 404
      search: { paths: 'auto', placeholder: '搜索', noData: '未找到结果' }
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@4/lib/docsify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@4/lib/plugins/search.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
</body>
</html>
```

### 2. 自动化脚本 docsify-sidebar.yml
推送代码时自动生成带文件夹分类（加粗）的侧边栏。
```yaml
name: Auto Sidebar
on:
  push:
    branches: [master]
    paths: ['**.md', '.github/workflows/docsify-sidebar.yml']
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Generate Sidebar
        run: |
          touch .nojekyll
          echo "* [首页](README.md)" > _sidebar.md
          prev_dir=""
          find . -name "*.md" ! -name "README.md" ! -name "_sidebar.md" ! -path "./.github/*" | sort | while read -r line; do
            rel_path=$(echo "$line" | sed 's|^\./||')
            dir_name=$(dirname "$rel_path")
            file_name=$(basename "$rel_path" .md)
            if [ "$dir_name" != "." ]; then
              if [ "$dir_name" != "$prev_dir" ]; then
                echo "* **$dir_name**" >> _sidebar.md
                prev_dir=$dir_name
              fi
              echo "  * [$file_name]($rel_path)" >> _sidebar.md
            else
              echo "* [$file_name]($rel_path)" >> _sidebar.md
            fi
          done
      - name: Push Changes
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "actions@github.com"
          git add _sidebar.md .nojekyll
          git commit -m "docs: auto update sidebar [skip ci]" || exit 0
          git push
```

## 五、 部署指南
1. 推送代码到 GitHub。
2. 进入 `Settings` -> `Pages`。
3. **Source**: Deploy from a branch。
4. **Branch**: `master` (或 `main`)，目录选 `/ (root)`。
5. 保存后等待 1-2 分钟即可访问。

---
*日期: 2026-02-24 | 字数: 2407*
