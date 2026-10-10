import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Save, X } from "lucide-react";

import { Card, Kicker, fmtDateTime, jsonFetch } from "../../page-shared";
import { ReceiptLine, RunButton, sendJson, type JobReceipt } from "./job-ui";

type Model = "haiku" | "sonnet";
type JobId = "prices" | "events";
type JobSetting = { enabled: boolean; mode: "daily" | "weekly"; weekday: string; times: string[] };
type Settings = {
  pausedAll: boolean;
  models: { extract: Model; judge: Model };
  jobs: Record<JobId, JobSetting>;
  events: { categories: string[] | null; standards: Record<string, string> };
};
type SettingsPage = {
  settings: Settings;
  version: number | null;
  jobs: Array<{ id: JobId; label: string; running: boolean; lastRun: JobReceipt | null; nextRun: string | null }>;
  quotaHold: { job: string; at: string; until: string } | null;
  categories: Array<{ key: string; label: string; criteria: string }>;
  sourceErrors: string[];
  claudeFound: boolean;
};

const WEEKDAYS: Array<[string, string]> = [["mon", "一"], ["tue", "二"], ["wed", "三"], ["thu", "四"], ["fri", "五"], ["sat", "六"], ["sun", "日"]];
const MODEL_LABELS: Record<Model, string> = { haiku: "Haiku（省额度）", sonnet: "Sonnet（更细致）" };

function ModelSelect({ value, onChange, label, hint }: { value: Model; onChange: (model: Model) => void; label: string; hint: string }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as Model)}>
        {(["haiku", "sonnet"] as Model[]).map((model) => <option key={model} value={model}>{MODEL_LABELS[model]}</option>)}
      </select>
      <small>{hint}</small>
    </label>
  );
}

function JobCard({ job, setting, onChange, onRun, running }: { job: SettingsPage["jobs"][number]; setting: JobSetting; onChange: (next: JobSetting) => void; onRun: () => void; running: boolean }) {
  const setTime = (index: number, value: string) => onChange({ ...setting, times: setting.times.map((time, i) => (i === index ? value : time)) });
  return (
    <Card className={`settings-job${setting.enabled ? "" : " is-off"}`}>
      <header>
        <div>
          <Kicker>{setting.enabled ? (job.nextRun ? `下次 ${job.nextRun.slice(5).replace("-", "/")}` : "已暂停") : "已关闭"}</Kicker>
          <h3>{job.label}</h3>
        </div>
        <label className="settings-switch">
          <input type="checkbox" checked={setting.enabled} onChange={(event) => onChange({ ...setting, enabled: event.target.checked })} />
          <span>{setting.enabled ? "开" : "关"}</span>
        </label>
      </header>
      <div className="settings-row" role="group" aria-label="频率">
        {(["daily", "weekly"] as const).map((mode) => (
          <button type="button" key={mode} className={setting.mode === mode ? "is-active" : ""} aria-pressed={setting.mode === mode} onClick={() => onChange({ ...setting, mode })}>{mode === "daily" ? "每天" : "每周"}</button>
        ))}
        {setting.mode === "weekly" ? (
          <select value={setting.weekday} aria-label="星期" onChange={(event) => onChange({ ...setting, weekday: event.target.value })}>
            {WEEKDAYS.map(([value, label]) => <option key={value} value={value}>星期{label}</option>)}
          </select>
        ) : null}
      </div>
      <div className="settings-times" role="group" aria-label="时刻（东京时间）">
        {setting.times.map((time, index) => (
          <span key={index} className="settings-time">
            <input type="time" value={time} onChange={(event) => setTime(index, event.target.value)} aria-label={`时刻 ${index + 1}`} />
            {setting.times.length > 1 ? <button type="button" aria-label="删除这个时刻" onClick={() => onChange({ ...setting, times: setting.times.filter((_, i) => i !== index) })}><X size={12} /></button> : null}
          </span>
        ))}
        {setting.times.length < 4 ? <button type="button" className="ghost-button small" onClick={() => onChange({ ...setting, times: [...setting.times, "21:00"] })}><Plus size={13} />时刻</button> : null}
      </div>
      <footer>
        <ReceiptLine receipt={job.lastRun} />
        <RunButton small running={job.running || running} onClick={onRun} />
      </footer>
    </Card>
  );
}

export default function SettingsView({ active }: { active: boolean }) {
  const [page, setPage] = useState<SettingsPage | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<JobId | null>(null);
  const load = async () => {
    try {
      const next = await jsonFetch<SettingsPage>("/api/tools/settings");
      setPage(next);
      setDraft(structuredClone(next.settings));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取失败");
    }
  };
  useEffect(() => { if (active) void load(); }, [active]);
  const anyRunning = Boolean(page?.jobs.some((job) => job.running));
  useEffect(() => {
    if (!active || !anyRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await jsonFetch<SettingsPage>("/api/tools/settings");
        // 只刷新运行状态，不覆盖正在编辑的草稿
        setPage(next);
      } catch {
        /* 下一轮再试 */
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [active, anyRunning]);

  if (!page || !draft) return error ? <p className="job-message is-error"><AlertTriangle size={14} />{error}</p> : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(page.settings);
  const chosen = draft.events.categories ?? page.categories.map((category) => category.key);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const next = await sendJson<SettingsPage>("/api/tools/settings", "PUT", { settings: draft, version: page.version });
      setPage(next);
      setDraft(structuredClone(next.settings));
      setMessage("已保存");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const run = async (job: JobId) => {
    setStarting(job);
    setMessage("");
    try {
      const result = await sendJson<{ message: string }>("/api/tools/jobs/run", "POST", { job });
      setMessage(result.message);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "没能发起");
    } finally {
      setStarting(null);
    }
  };
  const clearHold = async () => {
    await jsonFetch("/api/tools/quota-hold", { method: "DELETE" }).catch(() => undefined);
    await load();
  };

  return (
    <div className="settings-view">
      {!page.claudeFound ? <p className="job-message is-error"><AlertTriangle size={14} />找不到 Claude Code CLI：安装并登录 claude 后，后台任务才能运行</p> : null}
      {page.quotaHold ? (
        <p className="job-message is-error">
          <AlertTriangle size={14} />疑似额度用尽，定时任务暂停到 {fmtDateTime(page.quotaHold.until)}
          <button type="button" className="ghost-button small" onClick={() => void clearHold()}>解除</button>
        </p>
      ) : null}
      <Card className="settings-master">
        <div>
          <Kicker>所有后台任务</Kicker>
          <h3>{draft.pausedAll ? "全部暂停中" : "按各自时刻运行"}</h3>
          <small>工作台开着时才会按时运行；错过的时刻下次打开补跑最近一次</small>
        </div>
        <label className="settings-switch">
          <input type="checkbox" checked={!draft.pausedAll} onChange={(event) => setDraft({ ...draft, pausedAll: !event.target.checked })} />
          <span>{draft.pausedAll ? "暂停" : "运行"}</span>
        </label>
      </Card>

      <div className="settings-jobs">
        {page.jobs.map((job) => (
          <JobCard key={job.id} job={job} setting={draft.jobs[job.id]} running={starting === job.id} onRun={() => void run(job.id)} onChange={(next) => setDraft({ ...draft, jobs: { ...draft.jobs, [job.id]: next } })} />
        ))}
      </div>

      <Card className="settings-models">
        <Kicker>模型</Kicker>
        <h3>额度怎么花</h3>
        <div className="settings-model-grid">
          <ModelSelect label="摘录" hint="读网页、搜索词、同款判定" value={draft.models.extract} onChange={(extract) => setDraft({ ...draft, models: { ...draft.models, extract } })} />
          <ModelSelect label="判断" hint="买不买的建议、出门攻略" value={draft.models.judge} onChange={(judge) => setDraft({ ...draft, models: { ...draft.models, judge } })} />
        </div>
      </Card>

      <Card className="settings-events">
        <Kicker>东京活动</Kicker>
        <h3>采集哪些类别</h3>
        {page.sourceErrors.length ? <p className="job-message is-error"><AlertTriangle size={14} />{page.sourceErrors[0]}</p> : null}
        <div className="settings-categories">
          {page.categories.map((category) => {
            const on = chosen.includes(category.key);
            return (
              <div key={category.key} className={`settings-category${on ? " is-on" : ""}`}>
                <label>
                  <input type="checkbox" checked={on} onChange={(event) => setDraft({ ...draft, events: { ...draft.events, categories: event.target.checked ? [...chosen, category.key] : chosen.filter((key) => key !== category.key) } })} />
                  <strong>{category.label}</strong>
                </label>
                <small>{category.criteria}</small>
                {on ? (
                  <textarea
                    rows={2}
                    maxLength={400}
                    placeholder="入选标准"
                    aria-label={`${category.label} 的入选标准`}
                    value={draft.events.standards[category.key] ?? ""}
                    onChange={(event) => setDraft({ ...draft, events: { ...draft.events, standards: { ...draft.events.standards, [category.key]: event.target.value } } })}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="settings-save">
        {message ? <span role="status">{message}</span> : null}
        <button type="button" className="ghost-button" disabled={!dirty || saving} onClick={() => setDraft(structuredClone(page.settings))}>还原</button>
        <button type="button" className="gold-button" disabled={!dirty || saving} onClick={() => void save()}><Save size={14} />保存</button>
      </div>
    </div>
  );
}
