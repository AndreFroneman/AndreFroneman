"use client";

import {
  Activity, ArrowRight, Blocks, Braces, Check, CheckCircle2, ChevronDown,
  CircleDot, CloudUpload, Code2, GitBranch, HardDrive, History, Import,
  Layers3, Menu, Network, Play, RotateCcw, Search, ServerCog, Settings,
  ShieldCheck, TestTube2, UploadCloud, Variable, X, Zap,
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Toast = { title: string; detail: string } | null;

const pipeline = [
  { label: "Source", value: "main", icon: GitBranch, done: true },
  { label: "Generate", value: "1,248 bindings", icon: Braces, done: true },
  { label: "Validate", value: "42 / 42", icon: TestTube2, done: true },
  { label: "Approve", value: "2 of 2", icon: ShieldCheck, done: true },
  { label: "Release", value: "Ready", icon: UploadCloud, done: false },
];

const checks = [
  { name: "Tag schema", detail: "Naming, types and ranges", time: "18s", count: "1,248" },
  { name: "PLC compile", detail: "IEC 61131-3 build", time: "41s", count: "0 errors" },
  { name: "HMI bindings", detail: "Sparkplug B namespace", time: "12s", count: "612" },
  { name: "Logic tests", detail: "Interlocks and sequences", time: "1m 06s", count: "42 passed" },
];

const tags = [
  { tag: "MIX01_MTR_SPEED_SP", type: "REAL", plc: "Mixer.SpeedSP", hmi: "mixer_01/speed_sp", state: "Mapped" },
  { tag: "MIX01_MTR_RUNNING", type: "BOOL", plc: "Mixer.Running", hmi: "mixer_01/running", state: "Mapped" },
  { tag: "MIX01_TEMP_PV", type: "REAL", plc: "Mixer.TempPV", hmi: "mixer_01/temp_pv", state: "Mapped" },
  { tag: "MIX01_TEMP_HH", type: "REAL", plc: "Mixer.TempHH", hmi: "mixer_01/temp_hh", state: "Review" },
];

const nav = [
  { label: "Overview", icon: Layers3 }, { label: "Tag registry", icon: Variable },
  { label: "Logic", icon: Code2 }, { label: "Tests", icon: TestTube2, badge: "42" },
  { label: "Deployments", icon: CloudUpload }, { label: "Audit trail", icon: History },
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [sidebar, setSidebar] = useState(false);
  const [branch, setBranch] = useState("main");
  const [search, setSearch] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const visibleTags = useMemo(() => tags.filter((item) => item.tag.toLowerCase().includes(search.toLowerCase())), [search]);
  const notify = useCallback((title: string, detail: string) => {
    setToast({ title, detail });
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  const runChecks = useCallback(() => {
    setIsRunning(true);
    window.setTimeout(() => { setIsRunning(false); notify("Verification passed", "42 logic tests and 1,248 bindings are clean."); }, 1100);
  }, [notify]);

  useEffect(() => {
    type ModelTool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "get_controls_change_summary", title: "Get controls change summary",
      description: "Read the visible PLC ChangeOps change-set, validation and release readiness summary.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ changeSet: "CR-284", tagsAdded: 18, logicBlocks: 6, hmiBindings: 24, tests: { passed: 42, failed: 0 }, releaseReady: true }),
    }, { signal: lifecycle.signal }));
    void Promise.resolve(modelContext.registerTool({
      name: "run_controls_verification", title: "Run controls verification",
      description: "Run the same controls verification action available in the visible CI pipeline panel.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => { runChecks(); return { started: true, changeSet: "CR-284" }; },
    }, { signal: lifecycle.signal }));
    return () => lifecycle.abort();
  }, [runChecks]);
  function deploy() {
    setDeployed(true);
    notify("Release queued", "v2.8.4 will deploy to Line 4 during the approved window.");
  }
  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) notify("Tag source staged", `${file.name} is ready for mapping and validation.`);
  }

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#172019]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-[#d9ddd4] bg-[#f9faf7]/95 px-4 backdrop-blur md:px-6">
        <button className="mr-3 inline-flex h-9 w-9 items-center justify-center md:hidden" onClick={() => setSidebar(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center bg-[#d8ff52] text-[#142015] shadow-[3px_3px_0_#142015]"><Zap size={19} fill="currentColor" /></div>
          <div className="min-w-0"><div className="flex items-baseline gap-2"><span className="font-semibold tracking-[-0.02em]">PLC ChangeOps</span><span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-[#737d74] sm:inline">Workbench</span></div><p className="truncate text-[11px] text-[#737d74]">Controls change assurance</p></div>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <div className="hidden items-center gap-2 border-r border-[#d9ddd4] pr-4 text-xs text-[#59635a] sm:flex"><span className="h-2 w-2 bg-[#38a169]" />Edge online · 24 ms</div>
          <button className="icon-button" aria-label="Settings" onClick={() => notify("Settings", "Connector settings are ready to configure.")}><Settings size={17} /></button>
          <button className="flex items-center gap-2 text-left" onClick={() => notify("Signed in", "Andre Froneman · Controls administrator")}><span className="grid h-8 w-8 place-items-center bg-[#1f4d3b] text-xs font-bold text-white">AF</span><ChevronDown size={14} className="hidden sm:block" /></button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className={`${sidebar ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 w-64 border-r border-[#d9ddd4] bg-[#eef0ea] p-4 transition-transform md:sticky md:top-16 md:z-20 md:h-[calc(100vh-64px)] md:w-56 md:translate-x-0`}>
          <div className="mb-6 flex items-center justify-between md:hidden"><span className="font-semibold">Workspace</span><button className="icon-button" onClick={() => setSidebar(false)} aria-label="Close navigation"><X size={18} /></button></div>
          <div className="mb-5 border border-[#cfd5cb] bg-[#f9faf7] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a847b]">Current project</p>
            <div className="mt-2 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center bg-[#244f40] text-[#d8ff52]"><Blocks size={17} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">Mixing Line 4</p><p className="text-[11px] text-[#768078]">Allen-Bradley · Ignition</p></div></div>
          </div>
          <nav className="space-y-1" aria-label="Primary">
            {nav.map((item) => { const Icon = item.icon; return <button key={item.label} onClick={() => { setActive(item.label); setSidebar(false); }} className={`nav-item ${active === item.label ? "active" : ""}`}><Icon size={17} /><span>{item.label}</span>{item.badge && <span className="ml-auto text-[10px] font-bold">{item.badge}</span>}</button>; })}
          </nav>
          <div className="mt-7 border-t border-[#d2d7ce] pt-5"><p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a847b]">Connected</p><div className="space-y-3 px-2 text-xs text-[#566057]"><Connector icon={HardDrive} label="Nautilus runtime" state="Healthy" /><Connector icon={GitBranch} label="Git repository" state="Synced" /><Connector icon={Network} label="Ignition gateway" state="Online" /></div></div>
          <div className="absolute bottom-4 left-4 right-4 bg-[#183c30] p-3 text-white"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={15} className="text-[#d8ff52]" />Change window protected</div><p className="mt-1 text-[11px] leading-4 text-[#b8c8bf]">Next approved release: today, 18:00–19:00</p></div>
        </aside>
        {sidebar && <button className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setSidebar(false)} aria-label="Close navigation overlay" />}

        <section className="min-w-0 flex-1 px-4 py-5 md:px-7 md:py-7 xl:px-10">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div><p className="eyebrow">Mixing Line 4 / {active}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] md:text-[38px]">Ship controls changes with proof.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#69736b]">One tag source, generated bindings, testable IEC 61131-3 logic and a complete deployment record.</p></div>
              <div className="flex flex-wrap gap-2">
                <label className="branch-select"><GitBranch size={15} /><select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Git branch"><option>main</option><option>feature/mixer-sequence</option><option>field-sync/line-4</option></select></label>
                <button className="button secondary" onClick={() => fileRef.current?.click()}><Import size={16} />Import tags</button><input ref={fileRef} type="file" accept=".csv,.xlsx,.json" className="hidden" onChange={handleImport} />
                <button className="button primary" onClick={deploy} disabled={deployed}><Play size={16} fill="currentColor" />{deployed ? "Release queued" : "Deploy release"}</button>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-1 border border-[#cfd5cb] bg-[#fafbf8] md:grid-cols-5">
              {pipeline.map((step, index) => { const Icon = step.icon; return <div key={step.label} className="relative flex min-h-20 items-center gap-3 border-b border-[#d9ddd4] px-4 py-3 last:border-0 md:border-b-0 md:border-r"><span className={`grid h-9 w-9 shrink-0 place-items-center ${step.done ? "bg-[#dff3e5] text-[#176239]" : "bg-[#d8ff52] text-[#1b2b1f]"}`}><Icon size={17} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#788179]">{String(index + 1).padStart(2, "0")} · {step.label}</p><p className="mt-1 text-sm font-semibold">{step.value}</p></div></div>; })}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.75fr)]">
              <div className="space-y-5">
                <section className="panel">
                  <div className="panel-head"><div><p className="eyebrow">Change set #CR-284</p><h2>What will change</h2></div><div className="flex items-center gap-2 text-xs text-[#687269]"><span className="h-2 w-2 bg-[#e8a72f]" />1 item needs review</div></div>
                  <div className="grid border-b border-[#dde1d9] sm:grid-cols-3"><Metric value="18" label="Tags added" tone="green" /><Metric value="6" label="Logic blocks" tone="ink" /><Metric value="24" label="HMI bindings" tone="lime" /></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr><th>Change</th><th>Target</th><th>Source</th><th>Risk</th><th>Status</th></tr></thead><tbody><ChangeRow icon={Variable} title="Mixer 01 tag pack" meta="18 tags · generated" target="PLC + HMI" source="equipment-model.csv" risk="Low" status="Verified" /><ChangeRow icon={Code2} title="Temperature permissive" meta="2 rungs modified" target="PLC" source="mixer.st" risk="Medium" status="Review" /><ChangeRow icon={Activity} title="Mixer faceplate" meta="24 bindings · generated" target="Ignition" source="sparkplug.yaml" risk="Low" status="Verified" /></tbody></table></div>
                  <button className="text-link" onClick={() => notify("Diff opened", "Side-by-side logic and generated binding diff is ready.")}>Open full change diff <ArrowRight size={14} /></button>
                </section>

                <section className="panel">
                  <div className="panel-head gap-3"><div><p className="eyebrow">Single source of truth</p><h2>Tag registry</h2></div><label className="search-box"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a tag" /></label></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead><tr><th>Canonical tag</th><th>Type</th><th>PLC binding</th><th>HMI / Sparkplug</th><th>State</th></tr></thead><tbody>{visibleTags.map((item) => <tr key={item.tag}><td className="font-mono font-semibold text-[#23382c]">{item.tag}</td><td>{item.type}</td><td className="font-mono text-[#59645b]">{item.plc}</td><td className="font-mono text-[#59645b]">{item.hmi}</td><td><Status value={item.state} /></td></tr>)}</tbody></table></div>
                  <div className="flex items-center justify-between border-t border-[#dde1d9] px-5 py-3 text-xs text-[#707a71]"><span>Showing {visibleTags.length} of 1,248 tags</span><button className="font-semibold text-[#225843]" onClick={() => notify("Registry", "The complete canonical tag registry is available.")}>View all</button></div>
                </section>
              </div>

              <div className="space-y-5">
                <section className="panel"><div className="panel-head"><div><p className="eyebrow">CI pipeline</p><h2>Verification</h2></div><button className="icon-button" onClick={runChecks} aria-label="Run checks"><RotateCcw size={16} className={isRunning ? "animate-spin" : ""} /></button></div><div className="divide-y divide-[#e0e3dc]">{checks.map((check) => <div key={check.name} className="flex items-center gap-3 px-5 py-3.5"><CheckCircle2 size={18} className="shrink-0 text-[#2d8855]" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{check.name}</p><p className="text-[11px] text-[#788178]">{check.detail}</p></div><div className="text-right"><p className="text-xs font-semibold">{check.count}</p><p className="text-[10px] text-[#899189]">{check.time}</p></div></div>)}</div><div className="bg-[#edf7ef] px-5 py-3 text-xs text-[#286241]"><Check size={14} className="mr-2 inline" />Last run passed · 7 minutes ago</div></section>
                <section className="panel overflow-hidden"><div className="bg-[#193d31] p-5 text-white"><div className="flex items-center justify-between"><p className="eyebrow !text-[#a8c3b5]">Field reconciliation</p><span className="bg-[#d8ff52] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1b2b1f]">1 drift</span></div><h2 className="mt-2 text-lg font-semibold">A live edit is waiting.</h2><p className="mt-1 text-xs leading-5 text-[#b9c9c0]">Mixer.TempHH changed from 92.0 to 95.0 in the controller. Pull it into Git or restore the approved value.</p></div><div className="grid grid-cols-2 divide-x divide-[#dde1d9]"><button className="action-cell" onClick={() => notify("Field edit captured", "A branch and review request were created from the live value.")}><GitBranch size={16} />Pull to Git</button><button className="action-cell" onClick={() => notify("Approved value staged", "The 92.0 setpoint is ready for controlled restore.")}><RotateCcw size={16} />Restore approved</button></div></section>
                <section className="panel"><div className="panel-head"><div><p className="eyebrow">Deployment target</p><h2>Line 4 edge</h2></div><ServerCog size={18} className="text-[#547063]" /></div><div className="space-y-3 px-5 pb-5 text-xs"><KeyValue label="Runtime" value="Nautilus v0.18.2" /><KeyValue label="Controller" value="10.44.8.21 · RUN" /><KeyValue label="Retained state" value="Enabled · 38.4 MB" /><KeyValue label="Rollback" value="v2.8.3 · verified" /></div></section>
              </div>
            </div>
          </div>
        </section>
      </div>
      {toast && <div className="fixed bottom-5 right-5 z-[70] flex max-w-sm gap-3 border border-[#aac5b2] bg-[#f9fff9] p-4 shadow-[0_12px_30px_rgba(20,40,28,.16)]" role="status"><CheckCircle2 className="shrink-0 text-[#26734a]" size={20} /><div><p className="text-sm font-semibold">{toast.title}</p><p className="mt-0.5 text-xs leading-5 text-[#627067]">{toast.detail}</p></div><button className="ml-2 self-start" onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
    </main>
  );
}

function Connector({ icon: Icon, label, state }: { icon: typeof HardDrive; label: string; state: string }) { return <div className="flex items-center gap-2"><Icon size={14} /><span className="flex-1">{label}</span><span className="text-[10px] text-[#25824d]">{state}</span></div>; }
function Metric({ value, label, tone }: { value: string; label: string; tone: "green" | "ink" | "lime" }) { const colors = { green: "text-[#23784a]", ink: "text-[#1b3024]", lime: "text-[#5d7917]" }; return <div className="border-b border-[#dde1d9] px-5 py-4 last:border-0 sm:border-b-0 sm:border-r"><p className={`text-2xl font-semibold tracking-[-0.04em] ${colors[tone]}`}>{value}</p><p className="mt-1 text-[11px] text-[#778078]">{label}</p></div>; }
function ChangeRow({ icon: Icon, title, meta, target, source, risk, status }: { icon: typeof Variable; title: string; meta: string; target: string; source: string; risk: string; status: string }) { return <tr><td><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center bg-[#edf0ea] text-[#355747]"><Icon size={15} /></span><div><p className="font-semibold">{title}</p><p className="text-[10px] text-[#7e877f]">{meta}</p></div></div></td><td>{target}</td><td className="font-mono text-[11px] text-[#59645b]">{source}</td><td>{risk}</td><td><Status value={status} /></td></tr>; }
function Status({ value }: { value: string }) { const good = value === "Verified" || value === "Mapped"; return <span className={`status ${good ? "good" : "review"}`}><CircleDot size={10} />{value}</span>; }
function KeyValue({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-[#e1e4de] pb-2.5 last:border-0 last:pb-0"><span className="text-[#788178]">{label}</span><span className="font-semibold">{value}</span></div>; }
