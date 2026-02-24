import os
import re
from datetime import datetime

# 修正路径：使用相对路径，适应 CI 环境
BLOGS_DIR = "./blogs"

def count_words(content):
    """
    更准确地统计中英混合文本的字数。
    移除所有空白字符（空格、换行、制表符等），然后计算总长度。
    """
    # 移除所有空白字符
    cleaned_content = re.sub(r'\s+', '', content)
    return len(cleaned_content)

def update_blog_metadata(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 使用新的字数统计方法
    word_count = count_words(content)
    
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