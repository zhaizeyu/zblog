# 🚀 GPT-SoVITS (V2) Mac M4 极客流纯净部署全流程

本文将手把手教你如何在 Apple Silicon (M1/M2/M3/M4) 芯片的 Mac 上，从零开始部署并运行 GPT-SoVITS V2 语音合成系统。整个过程采用“无尘室”（虚拟环境）策略，确保系统干净、稳定，并针对 M 系列芯片的 MPS 硬件加速进行了优化。

## 🟢 阶段一：系统底层工具包安装

在 Mac 终端执行以下命令，安装音频处理、流媒体播放和爬虫所需的系统级工具。

```bash
# 安装 Homebrew (如果尚未安装)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装核心依赖
brew install ffmpeg portaudio yt-dlp
```

**重要提示**：请确保你的 Python 版本为 **3.11**。可以通过 `python3.11 --version` 命令验证。如果未安装，可通过 `brew install python@3.11` 安装。

## 🟡 阶段二：拉取源码与构建“无尘室” (Venv)

创建一个独立的 Python 虚拟环境，避免污染全局 Python 环境。

```bash
# 1. 克隆官方代码库
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS

# 2. 创建并激活 Python 3.11 虚拟环境
python3.11 -m venv venv
source venv/bin/activate

# 升级 pip 到最新版
pip install --upgrade pip
```

## 🟠 阶段三：注入深度学习依赖 (含避坑补丁)

在已激活的 `(venv)` 虚拟环境下，执行以下命令安装所有依赖。

```bash
# 1. 安装支持 Mac MPS 硬件加速的 PyTorch 核心
pip install torch torchvision torchaudio

# 2. 安装官方 requirements.txt 中的依赖
pip install -r requirements.txt

# 3. 🚨 避坑补丁1：安装缺失的音频解码器和流处理库
pip install torchcodec soundfile librosa

# 4. 🚨 避坑补丁2：一键补全 NLTK 文本处理词典 (解决 G2P 报错)
python -c "import nltk; nltk.download('averaged_perceptron_tagger_eng'); nltk.download('averaged_perceptron_tagger'); nltk.download('cmudict')"
```

## 🔴 阶段四：拉取大模型权重 (HuggingFace)

使用命令行直接从 Hugging Face 拉取预训练模型，无需手动下载。

```bash
# 安装 Hugging Face CLI 工具
pip install huggingface_hub

# 1. 拉取 GPT-SoVITS 核心模型预训练权重
huggingface-cli download lj1995/GPT-SoVITS --local-dir GPT_SoVITS/pretrained_models

# 2. 🚨 避坑补丁3：手动补全多语言语种探测模型 (解决 fast-langdetect 报错)
mkdir -p GPT_SoVITS/pretrained_models/fast_langdetect
curl -L https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin -o GPT_SoVITS/pretrained_models/fast_langdetect/lid.176.bin
```

## 🟣 阶段五：获取顶级纯净参考音频 (Zero-Shot 灵魂)

参考音频的质量直接决定了最终合成语音的效果。这里以获取《原神》刻晴的纯正中文傲娇语音为例。

```bash
# 1. 用 yt-dlp 从 B 站无损提取纯净切片音频
yt-dlp -x --audio-format wav "https://www.bilibili.com/video/BV1Lg4y1G7r8" -o "keqing_raw.wav"

# 2. 用 ffmpeg 极速裁剪出前 3.5 秒的极品干音，重采样为 32kHz
ffmpeg -i keqing_raw.wav -ss 00:00:00 -t 00:00:03.500 -acodec pcm_s16le -ar 32000 keqing_ref.wav
```

**关键点**：此时对应的 `prompt_text` 必须与音频内容一字不差，例如：`"别耽误时间了，跟我走。"`。

## ⚡ 阶段六：点火启动 API 服务

使用 M 芯片专属的环境变量，开启 V2 版本的 API 引擎。

```bash
# 必须保证在 venv 环境内执行
PYTORCH_ENABLE_MPS_FALLBACK=1 python api_v2.py
```

当看到终端输出 `Uvicorn running on http://0.0.0.0:9880` 时，即代表引擎已成功启动并挂载后台。

## 🎙️ 阶段七：最终调用 —— Python 流式直出客户端

在你的业务代码（如 `mouth.py`）中，写入以下代码，实现边生成边播放的极速体验。

```python
import requests
import subprocess

def speak_streaming(text_to_speak):
    url = "http://127.0.0.1:9880/tts"
    payload = {
        "text": text_to_speak,
        "text_lang": "zh",
        "ref_audio_path": "./keqing_ref.wav", # 你的顶级中文干音
        "prompt_text": "别耽误时间了，跟我走。", # 必须与干音一字不差
        "prompt_lang": "zh",
        "text_split_method": "cut5",
        "top_k": 10, # 降低以增加跨语种稳定性
        "top_p": 1,
        "temperature": 0.8 # 降温使咬字更连贯
    }
    
    print(f"🧠 [TTS] 正在流式生成并播放: {text_to_speak}")
    try:
        # 开启 stream=True，接收音频流
        response = requests.get(url, params=payload, stream=True)
        if response.status_code == 200:
            # 挂载 Mac 本地 ffplay 播放器，接收管道数据
            player = subprocess.Popen(
                ["ffplay", "-autoexit", "-nodisp", "-"],
                stdin=subprocess.PIPE,
                stderr=subprocess.DEVNULL
            )
            for chunk in response.iter_content(chunk_size=4096):
                if chunk:
                    player.stdin.write(chunk)
            player.stdin.close()
            player.wait()
            print("✅ [TTS] 播放完毕！")
        else:
            print(f"❌ [TTS] API 报错: {response.text}")
    except Exception as e:
        print(f"❌ 管道异常: {e}")

# 执行测试！
speak_streaming("哈？女——，女朋友？！干嘛要对着一个AI，灌输这种，无聊的信息啊！")
```

---
*日期: 2026-02-27 | 字数: 1200*