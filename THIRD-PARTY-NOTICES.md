# 第三方组件声明（Third-Party Notices）

咕咕地球（GuEarth）发行包中包含以下第三方开源组件。本文件与各组件的许可证原文随安装包分发：
安装后位于安装目录下的 `resources\licenses\`，仓库内位于 `resources/licenses/`。

本文件列出的「对应源码获取渠道」用于满足相应开源许可证（尤其是 LGPLv3）的源码提供要求。

- 组件：FFmpeg（`ffmpeg.exe`，Windows x64，版本 n8.1.3）
  - 许可证：GNU Lesser General Public License v3.0 or later（LGPL-3.0-or-later）
  - 许可证文本：`licenses/LGPL-3.0.txt`（附 `licenses/GPL-3.0.txt`；LGPLv3 以整体引用方式并入 GPLv3 条款）
  - 来源：基于 [KarinJS/FFmpeg-Builds](https://github.com/KarinJS/FFmpeg-Builds/tree/v8.1.3)（标签 v8.1.3）的
    `win32-x64-lgpl` 构建产物；该仓库是 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) 的
    二次开发分支，使用 FFmpeg 官方源码构建，本项目未作任何修改。
  - 使用方式：作为独立可执行程序以单独进程调用，不构成对 FFmpeg 的修改或再链接。
  - 对应源码获取渠道：
    - FFmpeg 源码（标签 n8.1.3）：https://github.com/FFmpeg/FFmpeg/tree/n8.1.3
    - 源码归档：https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz
    - 构建脚本、configure 参数与静态链接依赖的版本：见上述 KarinJS/FFmpeg-Builds 仓库（`build.sh`、`scripts.d/`）
  - 该构建内静态链接的其他开源库均为 LGPL/BSD 等宽松许可证；根据上述构建脚本可确定其确切版本与来源。
    如需任何组件对应的源码副本，可通过项目仓库与我们联系。
- 组件：OpenH264（静态编译于上述 FFmpeg 构建内；构建脚本对应上游提交 `1c5ac2f8d7fd7c263f0644e0e7a2a760775f0345`）
  - 许可证：BSD-2-Clause（Copyright (c) 2013, Cisco Systems）
  - 许可证文本：`licenses/openh264-BSD-2-Clause.txt`
- 组件：CesiumJS（三维数字地球引擎）
  - 许可证：Apache-2.0
  - 许可证文本与第三方代码清单：`licenses/Cesium-LICENSE.md`
  - 上游项目：https://github.com/CesiumGS/cesium
- 组件：Apache ECharts（图表库）
  - 许可证：Apache-2.0
  - 许可证文本：`licenses/ECharts-LICENSE.txt`
  - 内含子组件 d3.js（BSD-3-Clause）的许可证文本：`licenses/LICENSE-d3`
  - 上游项目：https://github.com/apache/echarts
- 组件：Vue.js、Pinia、Ant Design Vue、Ant Design X Vue、@ant-design/x、antd、Vue-ECharts、Markdown-It、KaTeX、Day.js、Sentry Electron SDK、React、React DOM、mp4-muxer（macOS 录制的 MP4 封装）
  - 许可证：MIT
  - 许可证原文（含各自版权行）：`licenses/mit/`
- 组件：Electron 与 Chromium
  - 许可证：MIT（Electron）；Electron 内含的 Chromium 及其他第三方组件另有各自许可证
  - 许可证文件随安装包提供：安装目录下的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html`

经打包工具并入本软件的其他传递依赖，同为 MIT 或 Apache-2.0 等宽松许可证。
