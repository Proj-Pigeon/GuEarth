<h1 align="center"><img src="build/icon.png" alt="GuEarth logo" width="40" height="40" /> 咕咕地球 GuEarth</h1>

<p align="center">
  “下一代由 AI 赋能的三维地球，为中国校园教学场景设计”
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-0.1.16%20early-f4f4f5?style=flat-square&labelColor=18181b" alt="0.1.16 early">
  <img src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-f4f4f5?style=flat-square&labelColor=18181b" alt="Windows, macOS, Linux">
  <img src="https://img.shields.io/badge/license-Apache--2.0-f4f4f5?style=flat-square&labelColor=18181b" alt="Apache-2.0">
</p>

## 特性

- 🌍 **多数据源 3D 地球** : 得益于互联网上各类开放数据，通过结合多源数据，我们可渲染出高精度的数字地球；
- 🤖 **EOQ 智能助手** : 自研 Agent Harness 框架，通过内置工具/知识库和互联网工具，让 AI 帮你做帮你说；
- 🧪 **地理实验室** : 通过内置的地理实验室，深度结合中国高中地理课程课本要求，通过实时数据实现地理数据可视化和分析；
- 🖼️ **教学场景** : 通过内置的教学场景工具，无论是人类还是 AI，都可以快速创建微课内容，助力 AI 教育赋能；
- 🎨 **丰富的标注工具** : 软件内置点线面、文本、箭头等地图标记工具，支持文件夹保存整理、AI 帮记等功能。

## 安装与使用

咕咕地球支持 `Windows x64`、`macOS（Apple Silicon）` 和 `Linux x86_64 / arm64`。

在 [GitHub Release](https://github.com/Proj-Pigeon/GuEarth/releases) 页面中可以下载最新的安装包。您也可以前往[官网](https://www.project-pigeon.com/docs#%E4%B8%8B%E8%BD%BD)获取以往版本的国内网盘下载链接/直链。

| 平台 | 安装包 |
| --- | --- |
| Windows x64 | `guearth-<版本>-x64-setup.exe` |
| macOS Apple Silicon | `guearth-<版本>-arm64.dmg` |
| Linux x86_64 | `guearth-<版本>-x86_64.AppImage`、`guearth-<版本>-amd64.deb` |
| Linux arm64 | `guearth-<版本>-arm64.AppImage`、`guearth-<版本>-arm64.deb` |

### Linux

安装包带有 Education 分类的桌面项和图标。deb 包名是 `guearth`，安装后可从应用菜单启动，或直接运行 `guearth`。需要 glibc 2.28 及以上（Ubuntu 20.04、Debian 10 及更新的发行版）。

```bash
sudo apt install ./guearth-<版本>-amd64.deb
```

AppImage 不需要安装：

```bash
chmod +x guearth-<版本>-x86_64.AppImage
./guearth-<版本>-x86_64.AppImage
```

中文界面建议安装思源黑体 / Noto CJK：`sudo apt install fonts-noto-cjk`。保存地图供应商密钥需要系统密钥环（GNOME Keyring 或 KWallet，依赖 `libsecret`）。自动更新目前仅 Windows 安装包提供。

### 从源码运行与打包

```bash
npm ci
npm run dev            # 开发模式，Linux / Windows / macOS 均可
npm run fetch:ffmpeg   # 当前平台的 LGPL FFmpeg（教学录制）
npm run build:linux    # Linux x64 与 arm64 的 AppImage 和 deb
npm run build:win
npm run build:mac
```

`build:linux` 会下载固定版本的 Linux FFmpeg（KarinJS/FFmpeg-Builds v8.1.3，LGPL，libopenh264），再调用 electron-builder。无法访问 GitHub 时，可按仓库 `AGENTS.md` 设置 Electron 与 electron-builder 的 npmmirror 镜像。

## 文档

您可以在 **鸽巢计划官网** 查阅相关文档：

- [软件介绍](https://www.project-pigeon.com/docs/what-is-guearth)
- [配置供应商](https://www.project-pigeon.com/docs/configuration)

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=proj-pigeon/guearth&type=date&legend=bottom-right)](https://www.star-history.com/?repos=proj-pigeon%2Fguearth&type=date&legend=bottom-right)

## 支持

鸽巢计划是一个为爱发电的学生组织，咕咕地球本体为开源项目，无任何收入来源，无闭源计划。**如果本项目对您的学习、教授有所帮助，欢迎通过以下渠道支持该项目的开发。**

- [GitHub Sponsor](https://github.com/sponsors/Nexaorion) (Nexaorion名义代收)
- [面包多](https://mbd.pub/o/bread/YZaWk59rag==)