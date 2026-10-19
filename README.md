# Paseo · 额度快照

在 Paseo 原生回复的耗时后追加 provider 剩余额度，并隐藏 Thinking 整行，例如：

```text
工作了15m 19s，weekly 剩余 76% · resets 5d
```

**从 0.2.1 起保留额度快照，并隐藏 Thinking。** Thinking 条目在排版前移除，连同行高一起去掉；流式和完成状态均生效。工具提示、进度文字、回复、字体和设置均使用 Paseo 原生展示。仅改变展示，不改变模型的推理设置。

早期版本的整轮折叠与样式增强不再加载；仓库和插件 ID 保持不变，方便已有用户更新。

## 安装与更新

适用于 **Paseo 0.11.4**，实际验证环境为 macOS 桌面端。daemon 所在机器需要 Git、Node.js 22 或更高版本和 npm，安装时自动准备依赖。

```sh
paseo plugin install git:elliclee/paseo-results-first --ref v0.2.1
```

也可在「设置 → 插件」的安装入口输入 `git:elliclee/paseo-results-first`。

已安装本插件的用户运行：

```sh
paseo plugin update paseo-results-first
```

按 Paseo 提示应用候选更新。插件 ID 仍为 `paseo-results-first`，显示名称改为「Paseo · 额度快照」。本插件没有外观设置页。如果另外安装了 Better Paseo 或其他样式插件，须停用它们，才能得到完整的原生展示。

## 额度快照

- 每条新完成回复首次展示时读取一次，保存在本机；没有定时检查。
- 重载后复用原快照；启用前没有快照的旧历史不补填。`resets` 保留抓取时的倒计时。
- 优先显示周额度，显示的是**剩余**百分比；只有已用值时按 `100 - usedPct` 换算。
- 只读取当前回复所属会话的 provider 额度；不可用、过期或无法明确区分账号时省略额度。
- 已有快照继续复用，文字格式、百分比空格保持不变。

Codex 已实测；Claude 的周额度格式兼容，但尚未进行真实账号验证。额度追加依赖 Paseo 0.11.4 桌面的内部结构，并非公开 SDK 接口。移动端不显示额度；Windows、Linux 尚未实测。升级 Paseo 后需要重新适配，因此当前限制宿主版本。

停用或卸载：

```sh
paseo plugin disable paseo-results-first
paseo plugin remove paseo-results-first
```

## 开发与来源

```sh
npm ci --include=dev --ignore-scripts
npm test -- test/unit/quota.test.ts test/unit/quota-only-entry.test.ts
npm run typecheck
npm run check:hermes
```

入口只追加额度和注册一个 reasoning 过滤器，不注册自定义渲染器或设置页。Thinking 返回零条目，不产生空白占位；正文中提及 Thinking 不受影响。其余早期外观代码保留为历史参考，不参与当前插件运行。插件由 Paseo 编译，无需另行打包桌面应用。维护说明见 [隐藏 Thinking](docs/hide-thinking.md)；[仅保留额度](docs/quota-only.md) 记录 0.2.0 的改动。

早期版本基于 [RoundRedDot/better-paseo](https://github.com/RoundRedDot/better-paseo) 的 `008fbfd` 源码快照，原始项目为 [ABorakati/beautiful-chat](https://github.com/ABorakati/beautiful-chat)。历史折叠实现来源为 [Daaaaave/paseo-fold-turns](https://github.com/Daaaaave/paseo-fold-turns)。保留原有 MIT 署名，详见 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和 [第三方说明](docs/third-party/paseo-fold-turns.md)。

安装或额度问题可在本仓库 Issues 反馈；请附 Paseo 版本及脱敏后的 `paseo plugin logs paseo-results-first` 输出。
