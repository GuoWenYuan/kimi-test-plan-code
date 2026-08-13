"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Pet, PetAppearance, PetDisplayState, PetMemory } from "@/lib/pet-types";
import { petImageUrl } from "@/components/pet/pet-image";
import { Markdown } from "@/components/pet/Markdown";

/** 宠物详情页：状态 / 对话（PIAgent）/ 记忆 / 外观 / 定时任务 / 文档 六个标签页 */

type Tab = "status" | "chat" | "memories" | "appearance" | "tasks" | "docs";

interface Msg {
  role: "user" | "assistant";
  text: string;
  think: string;
  tools: string[];
}

interface Preset {
  id: string;
  name: string;
  model: string;
}

const MAX_MESSAGES = 100;
const CHAT_KEY = (petId: string) => `pet-chat-${petId}`;

const STATE_LABEL: Record<PetDisplayState, string> = {
  idle: "平常",
  hungry: "饥饿",
  sleepy: "困倦",
  eating: "进食",
  petted: "被抚摸",
};

const ALL_STATES: PetDisplayState[] = ["idle", "hungry", "sleepy", "eating", "petted"];

/** 间隔分钟数的人性化显示：每 30 分钟 / 每 2 小时 / 每 3 天 */
function fmtInterval(minutes: number): string {
  if (minutes % 1440 === 0) return `每 ${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `每 ${minutes / 60} 小时`;
  return `每 ${minutes} 分钟`;
}

export default function PetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [pet, setPet] = useState<Pet | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [tab, setTab] = useState<Tab>("status");
  const [missing, setMissing] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/pets/${id}`);
    if (!res.ok) {
      setMissing(true);
      return;
    }
    const data = (await res.json()) as { pet: Pet; isOwner: boolean; canEdit: boolean };
    setPet(data.pet);
    setIsOwner(data.isOwner);
    setCanEdit(data.canEdit);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载拉取宠物详情（异步 setState）
    refresh();
  }, [refresh]);

  const showToast = useCallback((text: string, ms = 4000) => {
    setToast(text);
    setTimeout(() => setToast(""), ms);
  }, []);

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <p className="text-sm text-muted">宠物不存在。<Link href="/pets" className="text-accent">返回宠物列表</Link></p>
      </div>
    );
  }
  if (!pet) return <div className="mx-auto max-w-3xl p-4 md:p-6 text-sm text-muted">加载中…</div>;

  const tabs: { key: Tab; label: string; hidden?: boolean }[] = [
    { key: "status", label: "状态" },
    { key: "chat", label: "对话", hidden: !isOwner },
    { key: "memories", label: "记忆", hidden: !isOwner },
    { key: "appearance", label: "外观", hidden: !canEdit },
    { key: "tasks", label: "定时任务", hidden: !isOwner },
    { key: "docs", label: "文档", hidden: !isOwner },
  ];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/pets" className="text-sm text-muted hover:text-accent">← 宠物列表</Link>
        <h1 className="text-xl font-bold text-fg">{pet.name}</h1>
        {pet.ownerName && <span className="text-sm text-muted">主人：{pet.ownerName}</span>}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.filter((t) => !t.hidden).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              tab === t.key ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-subtle hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toast && (
        <div className="glass-card anim-pop mb-3 rounded-xl border-accent/40 px-3 py-2 text-sm text-fg shadow-lift">{toast}</div>
      )}

      {tab === "status" && <StatusTab pet={pet} isOwner={isOwner} onChanged={setPet} onToast={showToast} />}
      {tab === "chat" && isOwner && <ChatTab pet={pet} onPetChanged={setPet} onToast={showToast} />}
      {tab === "memories" && isOwner && <MemoriesTab petId={pet.id} onToast={showToast} />}
      {tab === "appearance" && canEdit && <AppearanceTab pet={pet} onChanged={setPet} onToast={showToast} />}
      {tab === "tasks" && isOwner && <TasksTab petId={pet.id} onToast={showToast} />}
      {tab === "docs" && isOwner && <DocsTab petId={pet.id} onToast={showToast} />}
    </div>
  );
}

// ---------- 状态 ----------

function StatusTab({
  pet,
  isOwner,
  onChanged,
  onToast,
}: {
  pet: Pet;
  isOwner: boolean;
  onChanged: (p: Pet) => void;
  onToast: (t: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const rename = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const res = await fetch("/api/pet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onToast(data.error ?? "改名失败");
      return;
    }
    onChanged(data.pet);
    setRenaming(false);
  };

  return (
    <div className="space-y-4">
      <img
        src={petImageUrl(pet, "idle")}
        alt={pet.name}
        className="mx-auto h-48 w-48 object-contain"
      />
      {isOwner && (
        <div className="flex items-center justify-center gap-1.5">
          {renaming ? (
            <>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={12}
                autoFocus
                className="w-28 rounded border border-line bg-canvas px-2 py-0.5 text-sm text-fg outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && rename()}
              />
              <button onClick={rename} className="text-xs text-accent">确定</button>
            </>
          ) : (
            <button
              onClick={() => { setNameInput(pet.name); setRenaming(true); }}
              className="text-xs text-muted hover:text-accent"
            >
              ✏️ 改名
            </button>
          )}
        </div>
      )}
      {!isOwner && (
        <p className="text-center text-sm text-muted">这是 {pet.ownerName} 的宠物</p>
      )}
    </div>
  );
}

// ---------- 对话 ----------

function ChatTab({
  pet,
  onPetChanged,
  onToast,
}: {
  pet: Pet;
  onPetChanged: (p: Pet) => void;
  onToast: (t: string) => void;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY(pet.id)) ?? "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Preset[]) => setPresets(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY(pet.id), JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      /* 存储满等异常忽略 */
    }
  }, [messages, pet.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const bindPreset = async (presetId: string) => {
    const res = await fetch(`/api/pets/${pet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onToast(data.error ?? "绑定模型失败");
      return;
    }
    onPetChanged(data.pet);
    onToast("模型已绑定，开始聊天吧");
  };

  function patchLast(fn: (m: Msg) => Msg) {
    setMessages((list) => {
      if (list.length === 0) return list;
      const next = [...list];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }

  // 清空对话：本机浏览器的记录 + 服务器缓存的 pi 会话历史一并删除（不可恢复）
  async function clearHistory() {
    if (busy) return;
    if (!confirm("确定清空对话记录吗？服务器上缓存的对话历史也会一并删除，不可恢复。")) return;
    const res = await fetch(`/api/pets/${pet.id}/chat`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onToast(data.error ?? "清空失败");
      return;
    }
    setMessages([]);
    try {
      localStorage.removeItem(CHAT_KEY(pet.id));
    } catch {
      /* 忽略 */
    }
    onToast("对话记录已清空");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text, think: "", tools: [] }, { role: "assistant", text: "", think: "", tools: [] }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/pets/${pet.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `请求失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const e = JSON.parse(line.slice(5)) as
              | { type: "think" | "delta"; text: string }
              | { type: "tool_start"; tool: string }
              | { type: "tool_end" }
              | { type: "done" }
              | { type: "error"; message: string }
              | { type: "memory_saved"; text: string };
            if (e.type === "delta") patchLast((m) => ({ ...m, text: m.text + e.text }));
            else if (e.type === "think") patchLast((m) => ({ ...m, think: m.think + e.text }));
            else if (e.type === "tool_start") patchLast((m) => ({ ...m, tools: [...m.tools, e.tool] }));
            else if (e.type === "error") throw new Error(e.message);
            else if (e.type === "memory_saved") onToast(`已记住：${e.text}`);
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
      // 流正常结束但一条正文都没收到（连接被中间层截断等）：
      // 给出提示而不是留下永久空白气泡，避免用户误以为宠物没回答
      setMessages((list) => {
        if (list.length === 0) return list;
        const last = list[list.length - 1];
        if (last.role !== "assistant" || last.text.trim() !== "") return list;
        const next = [...list];
        next[next.length - 1] = { ...last, text: "（这次回复好像丢了，再问我一次吧～）" };
        return next;
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patchLast((m) => ({ ...m, text: m.text || `出错了：${(e as Error).message}` }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  if (!pet.presetId) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
        <p className="text-sm text-fg">先为 {pet.name} 绑定一个你的模型预设，才能和它对话（key 只保存在服务器）。</p>
        {presets.length === 0 ? (
          <p className="text-sm text-muted">你还没有模型预设，请先到「模型」页面添加。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => bindPreset(p.id)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
              >
                {p.name}（{p.model}）
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-[60vh] flex-col rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="text-xs text-muted">多轮连续对话，记录保存在本机浏览器与服务器会话中</span>
        <button
          onClick={clearHistory}
          disabled={busy}
          className="shrink-0 text-xs text-muted hover:text-danger disabled:opacity-50"
        >
          清空对话
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted">和 {pet.name} 说点什么吧。说「记住…」它会认真记下来。</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-white" : "bg-subtle text-fg"
              }`}
            >
              {m.tools.length > 0 && (
                <p className="mb-1 text-xs opacity-70">使用了工具：{[...new Set(m.tools)].join("、")}</p>
              )}
              {m.text || (m.role === "assistant" && busy && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`对 ${pet.name} 说…`}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        {busy ? (
          <button
            onClick={() => abortRef.current?.abort()}
            className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm text-fg hover:border-accent"
          >
            停止
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!input.trim()}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- 记忆 ----------

function MemoriesTab({ petId, onToast }: { petId: string; onToast: (t: string) => void }) {
  const [memories, setMemories] = useState<PetMemory[]>([]);
  const [newMemory, setNewMemory] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/pets/${petId}/memories`);
    if (res.ok) setMemories(((await res.json()) as { memories: PetMemory[] }).memories);
  }, [petId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载拉取记忆列表（异步 setState）
    refresh();
  }, [refresh]);

  const add = async () => {
    if (!newMemory.trim()) return;
    const res = await fetch(`/api/pets/${petId}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newMemory }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onToast(data.error ?? "保存失败");
      return;
    }
    setNewMemory("");
    refresh();
  };

  const remove = async (memoryId: string) => {
    await fetch(`/api/pets/${petId}/memories?memoryId=${memoryId}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">对话时说「记住…」，宠物会自动精简并记下来；记忆会在之后的每次对话中自动生效。</p>
      <div className="flex gap-2">
        <input
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="也可以手动补一条记忆"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button
          onClick={add}
          disabled={!newMemory.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          添加
        </button>
      </div>
      {memories.length === 0 ? (
        <p className="text-sm text-muted">还没有记忆。</p>
      ) : (
        <ul className="space-y-2">
          {memories.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-lg border border-line bg-card px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-fg">{m.content}</span>
              <span className="shrink-0 text-xs text-muted">{m.createdAt.slice(0, 10)}</span>
              <button onClick={() => remove(m.id)} className="shrink-0 text-xs text-muted hover:text-danger">
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- 外观 ----------

function AppearanceTab({
  pet,
  onChanged,
  onToast,
}: {
  pet: Pet;
  onChanged: (p: Pet) => void;
  onToast: (t: string) => void;
}) {
  const [exprName, setExprName] = useState("");
  const [exprHint, setExprHint] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // 反复调整：当前展开调整区的表情名 + 修改意见 + 提交中标记 + 破缓存时间戳
  const [adjustingName, setAdjustingName] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [imgTs, setImgTs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const appearance: PetAppearance = {
    expressions: pet.appearance.expressions ?? {},
    stateMap: pet.appearance.stateMap ?? {},
    prompts: pet.appearance.prompts ?? {},
  };

  const save = async (next: PetAppearance) => {
    const res = await fetch(`/api/pets/${pet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appearance: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onToast(data.error ?? "保存失败");
      return;
    }
    onChanged(data.pet);
  };

  const addExpression = async () => {
    const name = exprName.trim();
    const file = fileRef.current?.files?.[0];
    if (!name || !file || uploading) return;
    if (appearance.expressions?.[name]) {
      onToast("已存在同名表情");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/pets/${pet.id}/assets`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error ?? "上传失败");
        return;
      }
      await save({ ...appearance, expressions: { ...appearance.expressions, [name]: data.file } });
      setExprName("");
      if (fileRef.current) fileRef.current.value = "";
      onToast(`表情「${name}」已添加`);
    } finally {
      setUploading(false);
    }
  };

  // AI 生成表情：服务器走 RightAPI gpt 生图（固定角色描述保证一致性），约 30-60 秒
  const generateExpression = async () => {
    const name = exprName.trim();
    if (!name || generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/pets/${pet.id}/assets/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hint: exprHint.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error ?? "生成失败");
        return;
      }
      onChanged(data.pet);
      setExprName("");
      setExprHint("");
      onToast(`表情「${name}」已生成`);
    } finally {
      setGenerating(false);
    }
  };

  const removeExpression = async (name: string) => {
    const file = appearance.expressions?.[name];
    const expressions = { ...appearance.expressions };
    delete expressions[name];
    const stateMap = { ...appearance.stateMap };
    for (const [k, v] of Object.entries(stateMap)) if (v === name) delete stateMap[k as PetDisplayState];
    const prompts = { ...appearance.prompts };
    if (file) delete prompts[file];
    await save({ expressions, stateMap, prompts });
    if (adjustingName === name) setAdjustingName(null);
    if (file) {
      fetch(`/api/pets/${pet.id}/assets?file=${encodeURIComponent(file)}`, { method: "DELETE" }).catch(() => {});
    }
  };

  // 反复调整：累积描述拼接本次意见重绘，覆盖原文件（引用不变），约 30-60 秒
  const adjustExpression = async (name: string) => {
    const file = appearance.expressions?.[name];
    const text = instruction.trim();
    if (!file || !text || adjusting) return;
    setAdjusting(true);
    try {
      const res = await fetch(`/api/pets/${pet.id}/assets/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, instruction: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error ?? "调整失败");
        return;
      }
      onChanged(data.pet);
      setInstruction("");
      setImgTs(Date.now()); // 破缓存刷新图片
      onToast(`「${name}」已按意见重绘`);
    } finally {
      setAdjusting(false);
    }
  };

  const setStateMap = async (state: PetDisplayState, exprNameValue: string) => {
    const stateMap = { ...appearance.stateMap };
    if (exprNameValue) stateMap[state] = exprNameValue;
    else delete stateMap[state];
    await save({ ...appearance, stateMap });
  };

  const exprEntries = Object.entries(appearance.expressions ?? {});

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        表情槽可以是任意名字，图片支持 PNG/JPG/GIF/WebP/SVG（GIF 即为动画）。把状态映射到某个表情后，对应状态下就会显示它。
      </p>

      <div className="space-y-2 rounded-2xl border border-line bg-card p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={exprName}
            onChange={(e) => setExprName(e.target.value)}
            placeholder="表情名，如 开心 / 打滚"
            maxLength={12}
            className="w-36 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
          <input
            value={exprHint}
            onChange={(e) => setExprHint(e.target.value)}
            placeholder="表情/动作描述（AI 生成用），如 开心得跳起来"
            maxLength={60}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && generateExpression()}
          />
          <button
            onClick={generateExpression}
            disabled={generating || !exprName.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {generating ? "生成中（约 1 分钟）…" : "AI 生成表情"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" className="text-sm text-muted" />
          <button
            onClick={addExpression}
            disabled={uploading || !exprName.trim()}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {uploading ? "上传中…" : "上传图片"}
          </button>
        </div>
        <p className="text-xs text-muted">AI 生成走 RightAPI gpt 生图，固定角色描述保证每次是同一只 yoyo 酱，透明底 PNG。</p>
      </div>

      {exprEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {exprEntries.map(([name, file]) => (
            <div key={name} className="rounded-2xl border border-line bg-card p-3 text-center shadow-card">
              <img
                src={`/api/pets/${pet.id}/assets/${encodeURIComponent(file)}${imgTs ? `?t=${imgTs}` : ""}`}
                alt={name}
                className="mx-auto h-20 w-20 object-contain"
              />
              <p className="mt-1 truncate text-sm text-fg">{name}</p>
              <div className="mt-1 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setAdjustingName(adjustingName === name ? null : name);
                    setInstruction("");
                  }}
                  className="text-xs text-accent hover:opacity-80"
                >
                  调整
                </button>
                <button onClick={() => removeExpression(name)} className="text-xs text-muted hover:text-danger">
                  删除
                </button>
              </div>
              {appearance.prompts?.[file] && (
                <p className="mt-1 line-clamp-2 text-xs text-muted" title={appearance.prompts[file]}>
                  {appearance.prompts[file]}
                </p>
              )}
              {adjustingName === name && (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="怎么改，如 笑得更开心一点"
                    maxLength={300}
                    className="w-full rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-fg outline-none focus:border-accent"
                    onKeyDown={(e) => e.key === "Enter" && adjustExpression(name)}
                  />
                  <button
                    onClick={() => adjustExpression(name)}
                    disabled={adjusting || !instruction.trim()}
                    className="w-full rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {adjusting ? "调整中（约 1 分钟）…" : "重新生成"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-2xl border border-line bg-card p-3 shadow-card">
        <p className="text-sm font-medium text-fg">状态映射（不映射则用内置默认图；进食/被抚摸是互动时短暂显示的表情）</p>
        {ALL_STATES.map((state) => (
          <div key={state} className="flex items-center gap-3">
            <span className="w-12 text-sm text-muted">{STATE_LABEL[state]}</span>
            <select
              value={appearance.stateMap?.[state] ?? ""}
              onChange={(e) => setStateMap(state, e.target.value)}
              className="rounded-lg border border-line bg-canvas px-2 py-1 text-sm text-fg outline-none focus:border-accent"
            >
              <option value="">内置默认</option>
              {exprEntries.map(([name]) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <img src={petImageUrl(pet, state)} alt={state} className="h-10 w-10 object-contain" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 定时任务 ----------

interface PetTask {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  /** 非 null 为间隔任务（cron 为空串） */
  intervalMinutes: number | null;
  /** 非 null 为一次性任务（执行后自动停用） */
  runAt: number | null;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: "ok" | "error" | null;
  lastResult: string | null;
}

function fmtTs(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 任务调度的一句话描述（创建成功提示用） */
function describeSchedule(t: PetTask): string {
  if (t.runAt !== null) return `一次性，${fmtTs(t.runAt)} 执行`;
  if (t.intervalMinutes !== null) return fmtInterval(t.intervalMinutes);
  return `cron ${t.cron}`;
}

function TasksTab({ petId, onToast }: { petId: string; onToast: (t: string) => void }) {
  const [tasks, setTasks] = useState<PetTask[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [adding, setAdding] = useState(false);
  // 调度方式：cron 表达式 或 间隔（数值 + 单位，提交时换算成分钟）
  const [mode, setMode] = useState<"cron" | "interval">("interval");
  const [cron, setCron] = useState("");
  const [intervalValue, setIntervalValue] = useState("30");
  const [intervalUnit, setIntervalUnit] = useState<"1" | "60" | "1440">("1");
  // 自然语言时间 → PIAgent 按意图规则直接建好任务
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/pets/${petId}/tasks`);
    if (res.ok) setTasks(((await res.json()) as { tasks: PetTask[] }).tasks);
  }, [petId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载拉取任务列表（异步 setState）
    refresh();
    // 轮询刷新，及时看到"立即运行"/到点执行的结果
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const intervalMinutes = (): number => Math.round(Number(intervalValue) * Number(intervalUnit));

  const parseNl = async () => {
    const text = nlText.trim();
    if (!text || parsing) return;
    setParsing(true);
    try {
      const res = await fetch(`/api/pets/${petId}/tasks/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error ?? "创建失败");
        return;
      }
      setNlText("");
      onToast(`任务已创建：「${data.task.name}」（${describeSchedule(data.task)}）`);
      refresh();
    } finally {
      setParsing(false);
    }
  };

  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const schedule =
        mode === "interval" ? { intervalMinutes: intervalMinutes() } : { cron: cron.trim() };
      const res = await fetch(`/api/pets/${petId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt, ...schedule }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error ?? "创建失败");
        return;
      }
      setName("");
      setCron("");
      setPrompt("");
      setNlText("");
      onToast("任务已创建");
      refresh();
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (task: PetTask) => {
    await fetch(`/api/pets/${petId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !task.enabled }),
    });
    refresh();
  };

  const remove = async (task: PetTask) => {
    await fetch(`/api/pets/${petId}/tasks/${task.id}`, { method: "DELETE" });
    refresh();
  };

  const runNow = async (task: PetTask) => {
    const res = await fetch(`/api/pets/${petId}/tasks/${task.id}/run`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onToast(data.error ?? "启动失败");
      return;
    }
    onToast(`「${task.name}」开始执行，稍后刷新看结果`);
    setTimeout(refresh, 5000);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        到点后宠物会以自己的人设去执行（用它绑定的模型和工作区），做完会在悬浮球里向你汇报。直接说一句话就能建任务：「1 分钟后提醒我」执行一次，「每天…」按日历重复，「每隔…」按间隔重复。
      </p>

      <div className="space-y-2 rounded-2xl border border-line bg-card p-3 shadow-card">
        <div className="flex gap-2">
          <input
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            placeholder="一句话说清时间和要做什么，如 1分钟后提醒我喝水 / 每天早上9点叫我起床 / 每隔半小时看看 workspace"
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && parseNl()}
          />
          <button
            onClick={parseNl}
            disabled={parsing || !nlText.trim()}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {parsing ? "创建中…" : "创建任务"}
          </button>
        </div>
        <p className="text-xs text-muted">用宠物绑定的模型预设理解这句话并直接建好任务（未绑预设时不可用）；下面是手动精确配置。</p>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="任务名，如 日报"
            maxLength={20}
            className="w-32 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
          <div className="flex rounded-lg border border-line text-sm">
            <button
              onClick={() => setMode("interval")}
              className={`px-3 py-1.5 rounded-l-lg ${mode === "interval" ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
            >
              按间隔
            </button>
            <button
              onClick={() => setMode("cron")}
              className={`px-3 py-1.5 rounded-r-lg ${mode === "cron" ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
            >
              按 cron
            </button>
          </div>
          {mode === "interval" ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted">每隔</span>
              <input
                value={intervalValue}
                onChange={(e) => setIntervalValue(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="w-16 rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
              />
              <select
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as "1" | "60" | "1440")}
                className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="1">分钟</option>
                <option value="60">小时</option>
                <option value="1440">天</option>
              </select>
            </div>
          ) : (
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="cron，如 0 9 * * *（每天 9 点）"
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
            />
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="让宠物做什么，如 整理工作区里的文件并汇报"
            maxLength={500}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button
            onClick={add}
            disabled={
              adding ||
              !name.trim() ||
              !prompt.trim() ||
              (mode === "cron" ? !cron.trim() : !(Number(intervalValue) > 0))
            }
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted">还没有定时任务。</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-2xl border border-line bg-card p-3 shadow-card">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(t)}
                  title={t.enabled ? "点击停用" : "点击启用"}
                  className={`h-5 w-9 shrink-0 rounded-full transition-colors ${t.enabled ? "bg-accent" : "bg-subtle"}`}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${t.enabled ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </button>
                <span className="text-sm font-bold text-fg">{t.name}</span>
                {t.runAt !== null ? (
                  <span className="rounded bg-subtle px-1.5 py-0.5 text-xs text-muted">一次性 {fmtTs(t.runAt)}</span>
                ) : t.intervalMinutes !== null ? (
                  <span className="rounded bg-subtle px-1.5 py-0.5 text-xs text-muted">{fmtInterval(t.intervalMinutes)}</span>
                ) : (
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-xs text-muted">{t.cron}</code>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {t.enabled ? `下次：${fmtTs(t.nextRunAt)}` : t.runAt !== null && t.lastRunAt ? "已完成" : "已停用"}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted">{t.prompt}</p>
              {t.lastRunAt && (
                <p className={`mt-1.5 rounded-lg bg-subtle px-2 py-1.5 text-xs ${t.lastStatus === "error" ? "text-danger" : "text-muted"}`}>
                  上次 {fmtTs(t.lastRunAt)} {t.lastStatus === "ok" ? "完成" : "失败"}：{(t.lastResult ?? "").slice(0, 200)}
                </p>
              )}
              <div className="mt-2 flex gap-3">
                <button onClick={() => runNow(t)} className="text-xs text-accent hover:opacity-80">立即运行</button>
                <button onClick={() => remove(t)} className="text-xs text-muted hover:text-danger">删除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- 文档（工作区文件预览） ----------

interface WorkspaceFile {
  file: string;
  size: number;
  updatedAt: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocsTab({ petId, onToast }: { petId: string; onToast: (t: string) => void }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/pets/${petId}/files`);
    if (res.ok) setFiles(((await res.json()) as { files: WorkspaceFile[] }).files);
  }, [petId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载拉取文件列表（异步 setState）
    refresh();
  }, [refresh]);

  const open = async (file: string) => {
    setSelected(file);
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/pets/${petId}/files?file=${encodeURIComponent(file)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error ?? "读取失败");
        setSelected(null);
        return;
      }
      setContent((data as { content: string }).content);
    } finally {
      setLoadingFile(false);
    }
  };

  const isMd = selected !== null && /\.(md|markdown)$/i.test(selected);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">宠物工作区里生成的文档（对话或定时任务产出），点击左侧文件预览。</p>
        <button onClick={refresh} className="shrink-0 text-xs text-accent hover:opacity-80">
          刷新
        </button>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-muted">工作区里还没有文档。可以让宠物「写一份…保存到工作区」，它就会出现在这里。</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <ul className="max-h-[60vh] w-full shrink-0 space-y-1 overflow-auto sm:w-56">
            {files.map((f) => (
              <li key={f.file}>
                <button
                  onClick={() => open(f.file)}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                    selected === f.file
                      ? "border-accent bg-card text-accent"
                      : "border-line bg-card text-fg hover:border-accent"
                  }`}
                >
                  <span className="block truncate">{f.file}</span>
                  <span className="block text-xs text-muted">
                    {fmtSize(f.size)} · {fmtTs(f.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-h-40 min-w-0 flex-1 rounded-2xl border border-line bg-card p-4 shadow-card">
            {!selected ? (
              <p className="text-sm text-muted">选择一个文件查看内容。</p>
            ) : loadingFile ? (
              <p className="text-sm text-muted">加载中…</p>
            ) : isMd ? (
              <Markdown text={content} />
            ) : (
              <pre className="overflow-auto whitespace-pre-wrap text-sm text-fg">{content}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
