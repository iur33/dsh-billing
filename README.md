# dsh-peak-billing

> DeepSeek Harness 的计费插件：输入框下方实时显示本会话花了多少钱，默认**全部按 DeepSeek 官网峰时价**折算，也可以切成**峰谷计费**；可选通过 SSH 把多台机器的用量汇总到一起。

单机即装即用，多机汇总只是一个可选的配置项——不配 `fleet` 就完全不知道远端的存在。

## 计费模式：全部峰时 / 峰谷

配置项 `tariff` 决定价格怎么套：

| `tariff` | 行为 | 适合谁 |
| --- | --- | --- |
| `peak`（默认） | **每次调用都按峰时价**，不看时钟 | 想要「最坏情况账单」、不想维护时段和节假日 |
| `time` | 按调用发生的时间判断：北京时间周一至周五 **9:00–12:00、14:00–18:00** 为峰时，其余为谷时（谷时 = 峰时 × `offPeakRatio`，默认 0.5） | 想贴近真实账单 |

默认是 `peak`：官方谷时价虽然只有一半，但时段判断（工作日、法定节假日、时区）很容易出错，按峰时算得到的是上限，不会低估成本。要更贴近实际就切到 `time`：

```yaml
config:
  tariff: time
  offPeakRatio: 0.5                      # 官方谷时价 = 峰时价的一半
  holidays: ['2026-10-01', '2026-10-02'] # 中国法定节假日，见下
```

`time` 模式的三个注意点：

- **节假日不内置**。官方定义排除了中国法定节假日，但节假日每年不同，插件不猜。没写进 `holidays` 的节假日会被当成普通工作日按峰时计——偏保守，不会少算。写进去的日期全天按谷时。
- **固定按北京时间**（`Asia/Shanghai`）判断，与机器本身时区无关。
- **多机汇总用同一套 `tariff`**：同步时会把模式和节假日传给 `bill.mjs`，远端只提供时间戳，价格统一在汇总机算。

界面上两种模式的区别：`peak` 显示「峰时价」徽标和一行「若按谷时价」对比；`time` 显示「峰谷价」徽标，并多出「峰时 tokens / 谷时 tokens」两行。

## 功能

- 输入框下方一个 `¥4.55` 药丸，随每条模型回复更新（宿主端 session projection，不轮询）。
- 点开明细：本轮费用、缓存命中 / 未命中 / 写入、输出、计费 tokens、调用次数、缓存节省、按模型费用、谷时价对比。
- 可选多机汇总：今日 / 本周 / 本月 / 总计四档切换，一台机器通过 SSH 拉另一台的用量，**对端不需要装插件**。
- 零依赖、无构建步骤、纯 JS；界面中英双语。

## 计费口径

| 档位 | 对应模型 | 输入·缓存命中 | 输入·缓存未命中 | 输出 |
| --- | --- | --- | --- | --- |
| `flash` | DeepSeek-V4.1-Flash-1017（`deepseek-flash`） | ¥0.04 | ¥2 | ¥8 |
| `pro` | DeepSeek-V4-Pro-0813（`deepseek-v4-pro`） | ¥0.30 | ¥9 | ¥27 |

单位：人民币元 / 百万 tokens。价格取自官方定价页（2026-10-30 核对）：
<https://api-docs.deepseek.com/zh-cn/quick_start/pricing>

单次调用：

```
(未命中 + 缓存写入) × 未命中价
+ 命中 × 命中价
+ 输出 × 输出价
÷ 1,000,000
```

- **缓存写入**按未命中价计（官方把写入缓存算进未命中输入）。
- 数据源是 provider 上报的 usage，不是字符数估算。
- 每条 `assistant/message` 单独计价，按 `provider/model` 分组，中途换模型不会串价。
- 只统计模型 token，**不含**搜索/抓取费用。
- 会话药丸只算当前会话；多机汇总会扫描所有会话日志，因此包含子会话（subagent）。

## 安装（单机）

前置：DSH 0.2.x（桌面端或 `dsh web` 都可以），Node 22.15+（宿主自带运行时即可，插件本身零依赖）。

```sh
git clone https://github.com/iur33/dsh-peak-billing.git
cd dsh-peak-billing
./scripts/install.sh                 # 默认 desktop profile
# DSH_PROFILE=web ./scripts/install.sh   # 或装进 web profile
```

脚本做两件事：把它软链进 `~/.dsh/profiles/<profile>/node_modules/`，并往该 profile 的
`cordis.patch.yml` 追加一条 insert（有备份、幂等）。**然后重启 DSH**——profile patch 只在启动时组装。

卸载：删掉 `cordis.patch.yml` 里的 `peak-billing` 那条、删掉软链，重启。

<details>
<summary>手动安装（不想跑脚本）</summary>

```sh
ln -sfn "$PWD" ~/.dsh/profiles/desktop/node_modules/dsh-peak-billing
cat >> ~/.dsh/profiles/desktop/cordis.patch.yml <<'EOF'

- insert:
    - id: peak-billing
      name: 'dsh-peak-billing'
EOF
```

</details>

## 配置价格

默认就是上面的官方峰时价。要改价、加档位或改模型匹配，只需覆盖要改的字段：

```yaml
- id: peak-billing
  name: 'dsh-peak-billing'
  config:
    symbol: '¥'
    currency: 'CNY'
    tariff: peak           # peak = 全部峰时；time = 按调用时段峰谷
    offPeakRatio: 0.5      # 谷时价 = 峰时价 × 该系数
    defaultTier: flash     # 匹配不到时按哪档计；null 则标为「未匹配价格」
    tiers:
      flash: { label: DeepSeek-V4.1-Flash, cacheHit: 0.04, cacheMiss: 2, output: 8 }
      pro:   { label: DeepSeek-V4-Pro,     cacheHit: 0.30, cacheMiss: 9, output: 27 }
      local: { label: Local, cacheHit: 0, cacheMiss: 0, output: 0 }
    rules:
      - { contains: flash, tier: flash }      # 模型 id 包含该子串（不区分大小写）
      - { regex: '^my-local-', tier: local }  # 或正则
```

`rules` 按顺序匹配，命中即停；都没命中时用 `defaultTier`，并在明细里标注「兜底档」。

## 多机汇总（可选）

一台机器当「汇总机」，通过 SSH 读另一台机器上的 DSH 会话日志。对端只需要 **Node** 和 **SSH 免密登录**，
不需要装这个插件、不需要开端口、不需要 Tailscale（能 SSH 通就行，Tailscale / 局域网 / 公网都可以）。

原理：

1. 汇总机跑 `scripts/bill.mjs`，扫本机 `$DSH_HOME/sessions` 下的会话日志；
2. 通过 `ssh <host> "node -"` 把 `scripts/remote-usage.mjs` 喂给远端执行，远端只回传**用量记录**
   （时间、模型、四个 token 桶），不传价格、不落文件；
3. 两边记录在汇总机上用同一张价格表（含 `tariff` 模式）折算、按天合并，写入 `$DSH_HOME/peak-billing/fleet.json`；
4. 插件在 `127.0.0.1` 上提供 `GET /dsh-peak-billing/fleet` 和 `POST /dsh-peak-billing/sync`，
   面板打开时读取；快照超过 5 分钟会自动同步一次，也可以点「同步」强制刷新。

启用：

```yaml
- id: peak-billing
  name: 'dsh-peak-billing'
  config:
    fleet:
      sshHost: my-server     # 就是 `ssh my-server` 里的别名
      label: My-Server       # 面板上显示的名字
      sync: true             # 关掉则只读 fleet.json
      push: false            # true 则每次同步后把快照 scp 到 sshHost（对端只读展示）
```

命令行也能直接看：

```sh
node scripts/bill.mjs --host my-server --label My-Server          # 打印
node scripts/bill.mjs --host my-server --label My-Server --write  # 顺便写 fleet.json
```

**让另一台机器也显示合计（只读）**：在汇总机上开 `push: true`，或者手动
`node scripts/bill.mjs --host my-server --write --push my-server`。对端插件不配 `fleet`，
只读推送过去的 `fleet.json`，底部会标「由 <汇总机> 汇总」，没有「同步」按钮。

把插件装到另一台机器（Windows 也可以，需要 tar + node）：

```sh
./scripts/deploy-windows.sh my-server desktop   # 参数：ssh 别名、profile 名
```

安全：两个接口只接受 `127.0.0.1` 的请求；同步接口只执行配置里那一条固定命令，不接受请求参数。

## 工作原理

- **会话**：`lib/projection.js` 注册 `peakBilling` session projection，把日志里每条
  `assistant/message` 的 usage 折成按模型的 token 桶；价格在 `view` 阶段套用，checkpoint 只存 token。
- **账本**：`lib/ledger.js` 扫全部会话日志（支持 DSH 的多帧 zstd 追加格式），按 `message.id` 去重
  （fork 继承的会话不会重复计费），按本地日期分桶。
- **接口**：`lib/fleet-route.js` 提供两个本机路由。
- **脚本**：`scripts/bill.mjs`（合并/写盘/推送）、`scripts/remote-usage.mjs`（远端探针）。
- **浏览器**：`lib/client.js` 是手写的 built-bundle 形态（`window.__ModuleLoader__.load`），
  只依赖基线模块 `react` / `react-dom`，注册到 `conversation.composer.dock`。

兼容性：在 DSH 0.2.1-rc.3 与 0.2.1-rc.5 上验证过（macOS 与 Windows 桌面端）。

## 自检

不需要装任何东西：

```sh
node test/verify.mjs   # 会话折叠、峰时价、checkpoint、配置覆盖
node test/ledger.mjs   # 多帧日志、fork 去重、按天分桶
node test/render.mjs   # 浏览器 bundle 注册、四档切换、渲染
```

## 限制

- 「全部机器」的日期以**汇总机时区**为准；跨时区机器会按汇总机日期归并。
- 远端只读会话日志，不去查 provider 账单；算的是「按官网价格估算」（峰时或峰谷）。
- 同步是**按需触发**（打开面板且快照超过 5 分钟，或点按钮），没有后台定时任务；
  需要定时可以在 cron / launchd / 计划任务里跑 `bill.mjs --write --push`。
- 汇总接口只给本机浏览器用；如果从另一台机器远程打开汇总机的 GUI，多机那块会拉不到数据。

## English summary

A DeepSeek Harness plugin that shows the running cost of the current session under the
composer. By default every call is priced at DeepSeek's official **peak** rates (off-peak is
exactly half, so peak is the worst-case bill); set `tariff: time` to price each call by
Beijing-time peak windows instead. Per-session numbers come from a host-side session
projection built on provider-reported usage — no estimation, no polling.

Multi-machine aggregation is optional: point `fleet.sshHost` at another box, and the host
pulls that machine's usage records over SSH (the remote side only needs Node + SSH, no
plugin), prices them locally, and serves a cached fleet document on `127.0.0.1` for the
day/week/month/all-time switch. See the Chinese section above for the config.

## License

MIT
