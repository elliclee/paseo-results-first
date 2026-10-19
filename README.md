# Paseo · 结果优先

少看过程，突出结果。每轮的工具调用和思考默认收起为一个「查看过程」入口，进度播报与最终回复继续使用 Paseo 原生展示。

这是基于 [Better Paseo](https://github.com/RoundRedDot/better-paseo) 的独立试用版，加入整轮折叠与回复后的额度快照。

## 安装

首版限定 **Paseo 0.11.4**；实际界面验证环境为 macOS 桌面端。运行 Paseo daemon 的机器需要 Git、Node.js 22 或更高版本和 npm，安装时会自动准备依赖。

```sh
paseo plugin install git:elliclee/paseo-results-first --ref v0.1.1
```

也可在「设置 → 插件」的安装入口输入 `git:elliclee/paseo-results-first`。

如果已启用原版 Better Paseo，请先停用，避免多个插件同时修改时间线：

```sh
paseo plugin disable better-paseo
```

同样请先停用其他整轮折叠插件。独立插件 ID 为 `paseo-results-first`，不覆盖原版安装。

安装后默认启用「结果优先」。在插件设置中关闭这个开关，可以使用继承自 Better Paseo 的详细卡片模式。

## 展示效果

- 每轮只有正文中的一个过程入口，点击原位展开、再点收起。
- 用户提问、进度播报和最终回复保持原生展示，保留 Markdown、图表、图片、文件链接及原生操作。
- 待回答问题、权限请求及会话错误保持可见；运行中自行处理的命令失败记录收在过程内。
- 工具与思考统一收进「正在处理…」入口；进度播报中的参数、测试数量和风险说明始终可见，完成后继续保留，不重复收入过程。
- 字体和字号跟随 Paseo。

在新完成回复的耗时后追加额度快照，例如：

```text
工作了15m 19s，weekly 剩余 76% · resets 5d
```

这里显示订阅额度剩余百分比。每条新完成回复首次展示时读取一次并保存在本机；没有定时检查，重载后复用原值，启用前没有快照的历史不补填。`resets` 保留抓取时的倒计时。

目前优先显示周额度，Codex 已实测；Claude 的周额度格式兼容，但尚未进行真实账号验证。额度读取失败或无法识别时省略这段文字。

额度追加依赖 Paseo 0.11.4 桌面的内部结构，并非公开 SDK 接口。移动端不显示额度；Windows、Linux 和移动端的界面行为尚未实测。升级 Paseo 后需要重新适配，因此首版限制宿主版本。

## 更新与停用

```sh
paseo plugin update paseo-results-first
```

安装时的 `--ref` 选择初始版本，后续更新会由 Paseo 展示候选修订，确认后应用。

```sh
paseo plugin disable paseo-results-first
paseo plugin remove paseo-results-first
```

如果要恢复原版，停用本插件后再启用 `better-paseo`。

## 开发与来源

```sh
npm ci --ignore-scripts
npm test -- --maxWorkers=2
npm run typecheck
npm run check:hermes
```

依赖安装属于发布准备；插件由 Paseo 编译，无需另行打包桌面应用。

本项目保留 Better Paseo 的原有 MIT 许可及署名。原始项目为 [ABorakati/beautiful-chat](https://github.com/ABorakati/beautiful-chat)，本版本基于 RoundRedDot/better-paseo 的 `008fbfd` 源码快照继续修改。整轮折叠基于 [Daaaaave/paseo-fold-turns](https://github.com/Daaaaave/paseo-fold-turns)，详见 [第三方说明](docs/third-party/paseo-fold-turns.md)、[LICENSE](LICENSE) 和 [NOTICE](NOTICE)。

问题与安装失败可在本仓库 Issues 反馈；请附 Paseo 版本及脱敏后的 `paseo plugin logs paseo-results-first` 输出。
