/*
 * Browser half of dsh-peak-billing.
 *
 * Hand-written in the built-bundle shape dsh-client-modules serves: running
 * the file registers a factory only; module bodies run at materialization.
 * It only requires the baseline module table (`react`, `react-dom`).
 */
window.__ModuleLoader__.load({
  id: "dsh-peak-billing",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const ReactDOM = require("react-dom");
    const h = React.createElement;

    const NS = "dsh-peak-billing";
    const PLUGIN = "dsh-peak-billing";
    const FLEET_URL = "/dsh-peak-billing/fleet";
    const SYNC_URL = "/dsh-peak-billing/sync";

    const CSS = [
      ".pbk-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
      ".pbk-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer}",
      ".pbk-pill:hover,.pbk-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".pbk-pill:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}",
      ".pbk-pill svg{flex:none;width:14px;height:14px}",
      ".pbk-label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
      ".pbk-panel{position:fixed;z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);min-width:min(300px,calc(100vw - 24px));backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-family:Inter,var(--dsw-font-family);font-size:12px;line-height:18px}",
      ".pbk-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;display:flex;font-weight:500}",
      ".pbk-title-label{align-items:center;gap:6px;min-width:0;display:inline-flex}",
      ".pbk-title-label svg{flex:none;width:14px;height:14px}",
      ".pbk-title-value{font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".pbk-badge{color:var(--dsw-alias-state-business-primary);font-size:11px;line-height:16px;margin-top:2px}",
      ".pbk-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}",
      ".pbk-grid{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(104px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
      ".pbk-grid dt,.pbk-grid dd{min-width:0;margin:0}",
      ".pbk-grid dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}",
      ".pbk-sub{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));font-size:11px;margin-left:4px}",
      ".pbk-models{margin-top:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".pbk-models-title{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-bottom:6px}",
      ".pbk-model{align-items:baseline;gap:12px;display:flex;justify-content:space-between}",
      ".pbk-model+.pbk-model{margin-top:4px}",
      ".pbk-model-name{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
      ".pbk-model-cost{font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".pbk-fleet{margin-top:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".pbk-fleet-head{color:var(--dsw-alias-label-tertiary);align-items:center;justify-content:space-between;gap:8px;font-size:11px;margin-bottom:6px;display:flex}",
      ".pbk-sync{color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:none;font:inherit;font-size:11px;padding:0 2px}",
      ".pbk-sync:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".pbk-tabs{background:var(--dsw-alias-bg-base);border-radius:var(--dsw-radius-md);box-sizing:border-box;gap:2px;padding:2px;margin-bottom:8px;display:flex}",
      ".pbk-tab{flex:1;border:none;border-radius:calc(var(--dsw-radius-md) - 2px);background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:11px;line-height:18px;padding:2px 0}",
      ".pbk-tab[aria-pressed=true]{color:var(--dsw-alias-state-business-primary);background:var(--dsw-specific-menu)}",
      ".pbk-fleet-total{color:var(--dsw-alias-label-primary);align-items:baseline;justify-content:space-between;gap:12px;display:flex}",
      ".pbk-fleet-total b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}",
      ".pbk-fleet-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:2px}",
      ".pbk-fleet-row{color:var(--dsw-alias-label-secondary);justify-content:space-between;gap:12px;margin-top:6px;display:flex}",
      ".pbk-fleet-row>:first-child{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
      ".pbk-fleet-row>:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".pbk-fleet-empty{color:var(--dsw-alias-label-tertiary);margin-top:6px}",
      ".pbk-fleet-error{color:var(--dsw-alias-label-tertiary);margin-top:6px;font-size:11px}",
      ".pbk-foot{color:var(--dsw-alias-label-tertiary);border-top:.5px solid var(--dsw-alias-border-l2);margin-top:12px;padding-top:10px;font-size:11px;line-height:16px}",
    ].join("");

    if (typeof document !== "undefined") {
      const tagId = `${PLUGIN}/billing.css`;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
        const tag = document.createElement("style");
        tag.dataset.plugin = PLUGIN;
        tag.dataset.pluginCss = tagId;
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
    }

    const zh = {
      "title": "会话费用",
      "badge.peak": "峰时价 · 人民币",
      "badge.time": "峰谷价 · 人民币",
      "pill.aria": "本会话费用（峰时价）{amount}",
      "row.lastTurn": "本轮费用",
      "row.calls": "模型调用",
      "row.cacheHit": "输入 · 缓存命中",
      "row.cacheMiss": "输入 · 缓存未命中",
      "row.cacheWrite": "输入 · 缓存写入",
      "row.output": "输出",
      "row.tokens": "计费 tokens",
      "row.savings": "缓存节省",
      "row.offPeak": "若按谷时价",
      "row.peakTokens": "峰时 tokens",
      "row.offPeakTokens": "谷时 tokens",
      "models": "按模型",
      "assumed": "兜底档",
      "unpriced": "未匹配价格",
      "fleet.title": "全部机器",
      "fleet.today": "今日",
      "fleet.week": "本周",
      "fleet.month": "本月",
      "fleet.all": "总计",
      "fleet.total": "合计",
      "fleet.calls": "{count} 次调用",
      "fleet.empty": "点「同步」从另一台机器拉取用量",
      "fleet.unavailable": "另一台机器未配置",
      "fleet.sync": "同步",
      "fleet.syncing": "同步中…",
      "fleet.updated": "更新于 {time}",
      "fleet.count": "{count} 台",
      "fleet.offline": "离线",
      "fleet.by": "由 {machine} 汇总",
      "fleet.failed": "同步失败：{reason}",
      "foot": "始终按 DeepSeek 官网峰时价计费,不含搜索/抓取费用。",
    };
    const en = {
      "title": "Session cost",
      "badge.peak": "peak price · CNY",
      "badge.time": "peak & off-peak · CNY",
      "pill.aria": "Session cost at peak price {amount}",
      "row.lastTurn": "This turn",
      "row.calls": "Model calls",
      "row.cacheHit": "Input · cache hit",
      "row.cacheMiss": "Input · cache miss",
      "row.cacheWrite": "Input · cache write",
      "row.output": "Output",
      "row.tokens": "Billed tokens",
      "row.savings": "Cache savings",
      "row.offPeak": "If off-peak",
      "row.peakTokens": "Peak tokens",
      "row.offPeakTokens": "Off-peak tokens",
      "models": "By model",
      "assumed": "fallback tier",
      "unpriced": "no price",
      "fleet.title": "All machines",
      "fleet.today": "Today",
      "fleet.week": "This week",
      "fleet.month": "This month",
      "fleet.all": "All time",
      "fleet.total": "Total",
      "fleet.calls": "{count} calls",
      "fleet.empty": "Press Sync to pull usage from the other machine",
      "fleet.unavailable": "The other machine is not configured",
      "fleet.sync": "Sync",
      "fleet.syncing": "Syncing…",
      "fleet.updated": "Updated {time}",
      "fleet.count": "{count} machines",
      "fleet.offline": "offline",
      "fleet.by": "aggregated by {machine}",
      "fleet.failed": "Sync failed: {reason}",
      "foot": "Always billed at DeepSeek's official peak price; excludes search and fetch.",
    };

    /** Four decimals under one cent, three under one yuan, two above. */
    function money(value, symbol) {
      if (!Number.isFinite(value) || value <= 0) return symbol + "0";
      if (value < 0.00005) return symbol + "<0.0001";
      const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
      return symbol + value.toFixed(digits);
    }

    /** Compact token counts for the narrow panel. */
    function compact(value) {
      if (!Number.isFinite(value) || value <= 0) return "0";
      if (value < 1000) return String(Math.round(value));
      if (value < 1e6) return (value / 1e3).toFixed(value < 1e4 ? 1 : 0) + "k";
      return (value / 1e6).toFixed(2) + "M";
    }

    function pad2(value) {
      return String(value).padStart(2, "0");
    }

    /** Local `YYYY-MM-DD`, the key the ledger buckets days under. */
    function dayKeyOf(date) {
      return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
    }

    /** First local day of a period, or null for all time. */
    function periodFloor(period, now) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      if (period === "today") return dayKeyOf(date);
      if (period === "week") {
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        return dayKeyOf(date);
      }
      if (period === "month") {
        date.setDate(1);
        return dayKeyOf(date);
      }
      return null;
    }

    /**
     * Sum one period from the fleet document, per machine and in total.
     *
     * @param fleet - the `fleet.json` document served by the host.
     * @param period - `today` | `week` | `month` | `all`.
     * @param now - the client clock, so "today" means the user's today.
     */
    function sumPeriod(fleet, period, now) {
      const floor = periodFloor(period, now);
      const days = fleet !== null && typeof fleet === "object" && fleet.days !== null && typeof fleet.days === "object" ? fleet.days : {};
      const per = {};
      let cost = 0;
      let calls = 0;
      for (const day of Object.keys(days).sort()) {
        if (floor !== null && day < floor) continue;
        const value = days[day] ?? {};
        cost += Number(value.cost) || 0;
        calls += Number(value.calls) || 0;
        for (const id of Object.keys(value.machines ?? {})) {
          const row = value.machines[id] ?? {};
          const entry = per[id] ?? (per[id] = { cost: 0, calls: 0 });
          entry.cost += Number(row.cost) || 0;
          entry.calls += Number(row.calls) || 0;
        }
      }
      const labels = {};
      const errors = {};
      for (const machine of fleet?.machines ?? []) {
        labels[machine.id] = machine.label ?? machine.id;
        if (machine.error) errors[machine.id] = machine.error;
      }
      const machines = Object.keys(per)
        .map((id) => ({ id, label: labels[id] ?? id, cost: per[id].cost, calls: per[id].calls, error: errors[id] ?? null }))
        .sort((left, right) => right.cost - left.cost || left.label.localeCompare(right.label));
      return { cost, calls, machines };
    }

    function Icon() {
      return h("svg", {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
        h("rect", { x: 1.8, y: 3.2, width: 12.4, height: 9.6, rx: 2 }),
        h("path", { d: "M6.1 6.2 8 8.5l1.9-2.3" }),
        h("path", { d: "M8 8.5V11" }),
        h("path", { d: "M6.4 9.4h3.2" })
      );
    }

    function row(key, label, value, title) {
      return [
        h("dt", { key: key + "-k" }, label),
        h("dd", { key: key + "-v", title }, value),
      ];
    }

    const PERIODS = [
      { id: "today", key: "fleet.today" },
      { id: "week", key: "fleet.week" },
      { id: "month", key: "fleet.month" },
      { id: "all", key: "fleet.all" },
    ];

    /** All-machines block with the day/week/month/all switch. */
    function FleetSection(props) {
      const { fleet, syncAvailable, busy, syncError, period, onPeriod, onSync, t, symbol, now } = props;
      if (fleet === null && !syncAvailable && syncError === null) return null;
      if (fleet === null) {
        return h("div", { className: "pbk-fleet" },
          h("div", { className: "pbk-fleet-head" },
            h("span", null, t("fleet.title")),
            syncAvailable && h("button", { type: "button", className: "pbk-sync", onClick: onSync, disabled: busy },
              busy ? t("fleet.syncing") : t("fleet.sync"))
          ),
          h("div", { className: "pbk-fleet-empty" }, syncAvailable ? t("fleet.empty") : t("fleet.unavailable")),
          syncError !== null && h("div", { className: "pbk-fleet-error" }, t("fleet.failed", { reason: syncError }))
        );
      }
      const sum = sumPeriod(fleet, period, now);
      const updated = new Date(fleet.generatedAt ?? now);
      const clock = pad2(updated.getHours()) + ":" + pad2(updated.getMinutes());
      return h("div", { className: "pbk-fleet", "data-peak-billing-fleet": true },
        h("div", { className: "pbk-fleet-head" },
          h("span", null, t("fleet.title")),
          syncAvailable && h("button", { type: "button", className: "pbk-sync", onClick: onSync, disabled: busy },
            busy ? t("fleet.syncing") : t("fleet.sync"))
        ),
        h("div", { className: "pbk-tabs", role: "group" },
          PERIODS.map((item) => h("button", {
            key: item.id,
            type: "button",
            className: "pbk-tab",
            "aria-pressed": period === item.id ? "true" : "false",
            onClick: () => onPeriod(item.id),
          }, t(item.key)))
        ),
        h("div", { className: "pbk-fleet-total" },
          h("span", null, t("fleet.total")),
          h("b", null, money(sum.cost, symbol))
        ),
        h("div", { className: "pbk-fleet-meta" }, t("fleet.calls", { count: sum.calls })),
        sum.machines.map((machine) => h("div", { className: "pbk-fleet-row", key: machine.id },
          h("span", null, machine.label + (machine.error ? " · " + t("fleet.offline") : "")),
          h("span", null, money(machine.cost, symbol))
        )),
        h("div", { className: "pbk-fleet-meta" },
          t("fleet.updated", { time: clock })
            + " · " + t("fleet.count", { count: fleet.machines.length })
            + (!syncAvailable && fleet.aggregatedBy ? " · " + t("fleet.by", { machine: fleet.aggregatedBy }) : "")),
        syncError !== null && h("div", { className: "pbk-fleet-error" }, t("fleet.failed", { reason: syncError }))
      );
    }

    function Panel(props) {
      const { billing, t, panelRef, pos, title, total, symbol } = props;
      const rows = [];
      if (billing.lastTurn !== null) {
        rows.push(...row("lastTurn", t("row.lastTurn"), money(billing.lastTurn.cost, symbol), billing.lastTurn.calls + " calls"));
      }
      rows.push(...row("cacheHit", t("row.cacheHit"), compact(billing.tokens.cacheRead), String(billing.tokens.cacheRead)));
      rows.push(...row("cacheMiss", t("row.cacheMiss"), compact(billing.tokens.input), String(billing.tokens.input)));
      if (billing.tokens.cacheWrite > 0) {
        rows.push(...row("cacheWrite", t("row.cacheWrite"), compact(billing.tokens.cacheWrite), String(billing.tokens.cacheWrite)));
      }
      rows.push(...row("output", t("row.output"), compact(billing.tokens.output), String(billing.tokens.output)));
      rows.push(...row("total", t("row.tokens"), compact(billing.tokens.total), String(billing.tokens.total)));
      if (billing.tariff === "time") {
        rows.push(...row("peakTokens", t("row.peakTokens"), compact(billing.tokens.peak), String(billing.tokens.peak)));
        rows.push(...row("offPeakTokens", t("row.offPeakTokens"), compact(billing.tokens.offPeak), String(billing.tokens.offPeak)));
      }
      rows.push(...row("calls", t("row.calls"), String(billing.calls), String(billing.calls)));
      if (billing.cacheSavings > 0) {
        rows.push(...row("savings", t("row.savings"), money(billing.cacheSavings, symbol)));
      }
      if (billing.offPeakCost !== null && billing.offPeakCost < billing.totalCost) {
        rows.push(...row("offPeak", t("row.offPeak"), money(billing.offPeakCost, symbol)));
      }

      return h("div", {
        ref: panelRef,
        className: "pbk-panel",
        role: "dialog",
        "aria-label": title,
        "data-peak-billing-panel": true,
        style: { left: pos.left, width: pos.width, bottom: pos.bottom },
      },
        h("div", { className: "pbk-title" },
          h("span", { className: "pbk-title-label" }, h(Icon, null), title),
          h("span", { className: "pbk-title-value" }, total)
        ),
        h("div", { className: "pbk-badge" }, t(billing.tariff === "time" ? "badge.time" : "badge.peak")),
        h("div", { className: "pbk-rule", "aria-hidden": true }),
        h("dl", { className: "pbk-grid" }, rows),
        billing.models.length > 0 && h("div", { className: "pbk-models" },
          h("div", { className: "pbk-models-title" }, t("models")),
          billing.models.map((model) => h("div", { className: "pbk-model", key: model.provider + "/" + model.model },
            h("span", { className: "pbk-model-name", title: model.model + " · " + model.calls + " calls" },
              model.label,
              model.assumed && h("span", { className: "pbk-sub" }, "(" + (model.tier === null ? t("unpriced") : t("assumed")) + ")")
            ),
            h("span", { className: "pbk-model-cost" }, money(model.cost, symbol))
          ))
        ),
        h(FleetSection, props),
        h("div", { className: "pbk-foot" }, t("foot"))
      );
    }

    function BillingPill(props) {
      const useProjection = props.useProjection;
      const t = props.t;
      const billing = useProjection("peakBilling");
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const [fleet, setFleet] = React.useState(null);
      const [syncAvailable, setSyncAvailable] = React.useState(false);
      const [syncError, setSyncError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [period, setPeriod] = React.useState("today");
      const anchorRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const syncInFlight = React.useRef(false);

      const place = React.useCallback(() => {
        const anchor = anchorRef.current;
        if (anchor === null) return;
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 16);
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        setPos({ left, width, bottom: Math.max(8, window.innerHeight - rect.top + 8) });
      }, []);

      React.useEffect(() => {
        if (!open) return undefined;
        place();
        const onKey = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        const onPointer = (event) => {
          const anchor = anchorRef.current;
          const panel = panelRef.current;
          if (anchor !== null && anchor.contains(event.target)) return;
          if (panel !== null && panel.contains(event.target)) return;
          setOpen(false);
        };
        const onMove = () => place();
        window.addEventListener("keydown", onKey, true);
        document.addEventListener("pointerdown", onPointer, true);
        window.addEventListener("resize", onMove);
        window.addEventListener("scroll", onMove, true);
        return () => {
          window.removeEventListener("keydown", onKey, true);
          document.removeEventListener("pointerdown", onPointer, true);
          window.removeEventListener("resize", onMove);
          window.removeEventListener("scroll", onMove, true);
        };
      }, [open, place]);

      React.useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        fetch(FLEET_URL, { credentials: "same-origin", cache: "no-store" })
          .then((response) => response.json())
          .then((value) => {
            if (!alive || value === null || typeof value !== "object") return;
            setSyncAvailable(value.sync === true);
            if (value.ok === true && value.fleet) setFleet(value.fleet);
            const age = value.ok === true ? Date.now() - (value.fleet?.generatedAt ?? 0) : Infinity;
            if (value.sync === true && age > 5 * 60 * 1000) startSync();
          })
          .catch(() => {});
        return () => { alive = false; };
      }, [open]);

      function startSync() {
        if (syncInFlight.current) return;
        syncInFlight.current = true;
        setBusy(true);
        setSyncError(null);
        fetch(SYNC_URL, { method: "POST", credentials: "same-origin" })
          .then((response) => response.json())
          .then((value) => {
            if (value !== null && value.ok === true && value.fleet) setFleet(value.fleet);
            else setSyncError(value?.reason ?? "failed");
          })
          .catch(() => setSyncError("network"))
          .finally(() => {
            syncInFlight.current = false;
            setBusy(false);
          });
      }

      if (billing === undefined || billing === null || billing.calls === 0) return null;

      const symbol = billing.symbol || "¥";
      const total = money(billing.totalCost, symbol);
      const title = t("title");

      return h("span", {
        className: "pbk-anchor",
        "data-composer-stat": "peak-billing",
        ref: anchorRef,
      },
        h("button", {
          type: "button",
          className: "pbk-pill",
          "aria-haspopup": "dialog",
          "aria-expanded": open ? "true" : "false",
          "aria-label": t("pill.aria", { amount: total }),
          title: title + " · " + total,
          onClick: () => setOpen(!open),
        },
          h(Icon, null),
          h("span", { className: "pbk-label" }, total)
        ),
        open && pos !== null && ReactDOM.createPortal(
          h(Panel, {
            billing, t, panelRef, pos, title, total, symbol,
            fleet, syncAvailable, busy, syncError, period,
            onPeriod: setPeriod,
            onSync: startSync,
            now: Date.now(),
          }),
          document.body
        )
      );
    }

    const inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-peak-billing: dictionaries");
      ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
        name: "conversation.composer.dock",
        id: "peak-billing",
        order: 2,
        locale: NS,
      }, BillingPill));
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__sumPeriod = sumPeriod;
    return module.exports;
  }
});
