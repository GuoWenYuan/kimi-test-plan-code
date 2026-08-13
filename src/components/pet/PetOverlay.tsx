"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Pet, PetDisplayState } from "@/lib/pet-types";
import { PET_DISPLAY_STATES } from "@/lib/pet-types";
import { petImageUrl } from "@/components/pet/pet-image";

/**
 * 全局电子宠物悬浮球（所有登录页面右下角）。
 * - 收起态：可拖拽的圆球（位置存 localStorage），表情每几秒随机切换
 * - 展开态：宠物面板（改名 / 任务汇报气泡 / 详情入口），60s 轮询刷新
 * - 宠物来自全局宠物池（一宠一主），领养 = 从池里选一只未被领养的
 * 素材：外观槽自定义图（/api/pets/[id]/assets/）优先，回退内置 public/pet/ 五表情
 */

const POS_KEY = "pet-ball-pos";
const SIZE_KEY = "pet-ball-size";
const DEFAULT_POS = { x: 24, y: 24 }; // 距右/下边缘 px
const DEFAULT_SIZE = 256; // 悬浮球直径 px（初版 64 的 4 倍）
const MIN_SIZE = 64;
const MAX_SIZE = 384;
/** 表情随机轮播间隔（ms） */
const EXPR_INTERVAL = 8000;

export default function PetOverlay() {
  const [pet, setPet] = useState<Pet | null | undefined>(undefined); // undefined=加载中
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(DEFAULT_POS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [bubble, setBubble] = useState("");
  const [expr, setExpr] = useState<PetDisplayState>("idle");
  const [nameInput, setNameInput] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [adoptables, setAdoptables] = useState<Pet[]>([]);
  const [adoptTarget, setAdoptTarget] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; baseSize: number } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string, ms = 5000) => {
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(""), ms);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pet");
      if (!res.ok) return;
      const data = await res.json();
      setPet(data.pet ?? null);
      // 定时任务汇报：宠物主动"告诉"主人任务结果（展示一次，多条全部列出）
      const notices = (data.notices ?? []) as { taskName: string; status: string; result: string }[];
      if (notices.length > 0) {
        say(
          notices
            .map((n) =>
              n.status === "ok"
                ? `「${n.taskName}」做完啦：${n.result || "搞定！"}`
                : `「${n.taskName}」没做成：${n.result}`
            )
            .join("\n\n"),
          20000
        );
      }
    } catch {
      // 网络失败静默，下轮轮询再试
    }
  }, [say]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载拉取宠物状态（异步 setState）
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // 表情随机轮播：每 EXPR_INTERVAL 随机换一个显示状态（不与当前重复）
  useEffect(() => {
    if (!pet) return;
    const timer = setInterval(() => {
      setExpr((cur) => {
        const candidates = PET_DISPLAY_STATES.filter((s) => s !== cur);
        return candidates[Math.floor(Math.random() * candidates.length)];
      });
    }, EXPR_INTERVAL);
    return () => clearInterval(timer);
  }, [pet]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载恢复本地存储的悬浮球位置
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") setPos(saved);
      const savedSize = Number(localStorage.getItem(SIZE_KEY));
      if (savedSize >= MIN_SIZE && savedSize <= MAX_SIZE) setSize(savedSize);
    } catch {
      // 位置/尺寸损坏就用默认
    }
  }, []);

  // 展开面板且未领养时，拉宠物池里待领养的列表
  useEffect(() => {
    if (!open || pet !== null) return;
    fetch("/api/pets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setAdoptables((data.pets as Pet[]).filter((p) => !p.ownerUserId));
      })
      .catch(() => {});
  }, [open, pet]);

  const adopt = async () => {
    if (!adoptTarget) return;
    const res = await fetch("/api/pet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adopt", petId: adoptTarget, name: nameInput.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      say(data.error ?? "领养失败");
      return;
    }
    setPet(data.pet);
    setNameInput("");
    setAdoptTarget(null);
    say(`你好呀，我是 ${data.pet.name}！`);
  };

  const submitName = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const res = await fetch("/api/pet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      say(data.error ?? "操作失败");
      return;
    }
    setPet(data.pet);
    setNameInput("");
    setRenaming(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (!d.moved) return;
    const next = {
      x: Math.max(0, Math.min(window.innerWidth - size - 24, d.baseX - dx)),
      y: Math.max(0, Math.min(window.innerHeight - size - 24, d.baseY - dy)),
    };
    setPos(next);
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } else {
      setOpen((v) => !v);
    }
  };

  // 右下角手柄拖拽缩放（向右下拖放大，向左上拖缩小）
  const onResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, baseSize: size };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const delta = e.clientX - r.startX + (e.clientY - r.startY);
    setSize(Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(r.baseSize + delta))));
  };
  const onResizeEnd = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!resizeRef.current) return;
    resizeRef.current = null;
    localStorage.setItem(SIZE_KEY, String(size));
  };

  if (pet === undefined) return null; // 加载中不渲染，避免闪烁

  const ballImg = Math.round(size * 0.75);
  const panelImg = Math.max(120, Math.min(220, ballImg));

  return (
    <>
      <style>{`
        @keyframes pet-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        .pet-bob { animation: pet-bob 2.8s ease-in-out infinite; }
        .pet-img { -webkit-user-drag: none; user-select: none; }
      `}</style>

      {open && (
        <div
          className="fixed z-50 w-[270px] rounded-2xl border border-line bg-card p-4 shadow-xl"
          style={{ right: pos.x, bottom: pos.y + size + 12 }}
        >
          {pet === null ? (
            <div className="space-y-3">
              <img src="/pet/idle.png" alt="宠物" className="pet-img mx-auto h-32 w-32 object-contain" />
              {adoptables.length === 0 ? (
                <p className="text-center text-sm text-muted">
                  宠物池里暂时没有待领养的宠物，等管理员放几只进来吧
                </p>
              ) : (
                <>
                  <p className="text-center text-sm text-muted">还没有宠物，从宠物池里选一只领养吧</p>
                  <div className="max-h-36 space-y-1 overflow-auto">
                    {adoptables.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAdoptTarget(a.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${
                          adoptTarget === a.id
                            ? "border-accent text-accent"
                            : "border-line text-fg hover:border-accent"
                        }`}
                      >
                        <img src={petImageUrl(a, "idle")} alt="" className="pet-img h-8 w-8 object-contain" />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="给TA改个名（可选）"
                      maxLength={12}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
                      onKeyDown={(e) => e.key === "Enter" && adopt()}
                    />
                    <button
                      onClick={adopt}
                      disabled={!adoptTarget}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      领养
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <img
                src={petImageUrl(pet, expr)}
                alt={pet.name}
                className="pet-img pet-bob mx-auto object-contain"
                style={{ width: panelImg, height: panelImg }}
              />
              <div className="flex items-center justify-center gap-1.5">
                {renaming ? (
                  <>
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={12}
                      autoFocus
                      className="w-24 rounded border border-line bg-canvas px-2 py-0.5 text-sm text-fg outline-none focus:border-accent"
                      onKeyDown={(e) => e.key === "Enter" && submitName()}
                    />
                    <button onClick={() => submitName()} className="text-xs text-accent">确定</button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold text-fg">{pet.name}</span>
                    <button
                      onClick={() => { setNameInput(pet.name); setRenaming(true); }}
                      className="text-xs text-muted hover:text-accent"
                      title="改名"
                    >
                      ✏️
                    </button>
                  </>
                )}
              </div>

              {bubble && (
                <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2 text-center text-xs text-muted">{bubble}</div>
              )}

              <Link
                href={`/pets/${pet.id}`}
                className="block rounded-lg border border-line py-1.5 text-center text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                对话 / 记忆 / 外观管理
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 对话泡：悬浮球收起态也能看到宠物说话（定时任务汇报等），点击关闭 */}
      {bubble && !open && (
        <div
          className="fixed z-50 w-64 max-w-[70vw] cursor-pointer rounded-2xl rounded-br-sm border border-line bg-card px-3 py-2 text-xs text-fg shadow-xl"
          style={{ right: pos.x, bottom: pos.y + size + 12 }}
          onClick={() => setBubble("")}
          title="点击关闭"
        >
          <div className="max-h-48 overflow-auto whitespace-pre-wrap">{bubble}</div>
        </div>
      )}

      <button
        className="fixed z-50 flex cursor-grab items-center justify-center rounded-full border border-line bg-card shadow-lg transition-shadow hover:shadow-xl active:cursor-grabbing"
        style={{ right: pos.x, bottom: pos.y, width: size, height: size, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="电子宠物"
      >
        <img
          src={pet ? petImageUrl(pet, expr) : `/pet/${expr}.png`}
          alt=""
          className="pet-img object-contain"
          style={{ width: ballImg, height: ballImg }}
        />
        {/* 缩放手柄：右下角小方块，拖拽改变悬浮球尺寸 */}
        <span
          className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-line bg-subtle"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        />
      </button>
    </>
  );
}
