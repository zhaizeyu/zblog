import os
import re
from datetime import datetime

# 修正路径：使用相对路径，适应 CI 环境
BLOGS_DIR = "./blogs"

def update_blog_metadata(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Calculate word count (simplified: count non-whitespace blocks)
    # For Chinese, a more accurate way is needed, but this is a start
    word_count = len(re.findall(r'\w+', content))
    
    # Check if metadata already exists (basic detection)
    date_str = datetime.now().strftime("%Y-%m-%d")
    metadata_line = f"\n\n---\n*日期: {date_str} | 字数: {word_count}*"

    if "字数:" in content:
        # Update existing metadata line if found at the end
        content = re.sub(r'\n\n---\n\*日期: .* \| 字数: .*\*$', metadata_line, content)
    else:
        content += metadata_line

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    for root, dirs, files in os.walk(BLOGS_DIR):
        for file in files:
            if file.endswith(".md"):
                update_blog_metadata(os.path.join(root, file))