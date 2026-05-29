# clink

一个轻量的桌面终端壳，用来同时跑 Claude Code、Codex、Grok 三个终端 CLI。基于 Tauri (Rust + 系统 webview) + xterm.js，没有 Electron。

## 运行

需要 Node、Rust 工具链，以及已装好的 `claude` / `codex` / `grok`（在 PATH 上即可）。

```bash
cd clink
npm install        # 首次
npm run tauri dev  # 开发模式，弹出窗口
```

注意：必须在你自己的终端 App 里运行。GUI 程序从非交互的后台进程启动会拿不到窗口会话而立即退出。

打包发布版：

```bash
npm run tauri build
```

## 功能

- 三种终端：每个面板内点 Claude / Codex / Grok 启动，各自独立 PTY。
- 多列 + 多标签：最多 3 列并排（拖列间分隔条调宽），每列内可开无限标签页，标签上点 + 新增、点 ✕ 关闭。
- 续接历史会话：工具栏「历史」列出三个工具的旧对话，按标题/目录筛选，点一条在它原本的工作目录里 resume。可置顶、可删除（删除会从磁盘移除对应文件，有二次确认）。
- 技能面板：扫 `~/.claude` `~/.codex/skills` `~/.grok/skills`，按工具分页；点技能把 `/名字` 插进对应面板。
- 技能启用 / 禁用：user 来源的技能可一键开关，禁用即把文件夹移到 `~/.<tool>/skills-disabled/`，启用移回，可逆不丢数据。
- 导入技能：选目标工具后填路径或拖文件夹进窗口，复制含 `SKILL.md` 的文件夹到对应 `skills/`。
- 新建文件 / 文件夹，目录可用原生文件选择器选取。
- 界面中英切换：工具栏 中/EN 按钮一键切换，选择记在本地，下次启动沿用。

## 读取的存储位置

- Claude 会话：`~/.claude/projects/<目录>/<id>.jsonl`
- Codex 会话：`~/.codex/sessions/年/月/日/rollout-*.jsonl`，索引在 `~/.codex/session_index.jsonl`
- Grok 会话：`~/.grok/sessions/<编码目录>/<id>/chat_history.jsonl`
- 技能：各工具的 `skills/`（及禁用区 `skills-disabled/`），Claude 还含 `plugins/`

PTY 输出走 Tauri 二进制 Channel（原始字节，不走 JSON），终端用 xterm.js 的 WebGL 渲染。

## 已知限制

WebGL 上下文是每个终端一个，浏览器对同时存在的 WebGL 上下文有上限（约 16 个）。标签开得非常多时，个别终端可能丢失 WebGL 上下文并自动回退到默认 DOM 渲染（已由 `onContextLoss` 处理，不会崩，只是那一个终端重绘略慢）。正常使用到不了这个量级。

## License

MIT
