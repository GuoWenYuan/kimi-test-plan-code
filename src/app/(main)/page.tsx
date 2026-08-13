import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/auth";
import { listUsers } from "@/lib/store";
import { listPresets } from "@/lib/models-store";
import { getMyPet, listPets } from "@/lib/pet-store";
import { petImageUrl } from "@/components/pet/pet-image";
import { NAV_ICONS } from "@/components/nav-items";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

// 卡片右下角的前往箭头，hover 时滑出
function ArrowLink() {
  return (
    <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-line text-muted opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
    </span>
  );
}

export default async function HomePage() {
  const user = await requireUserOrRedirect();
  const myPresetCount = (await listPresets(user.id)).length;
  const userCount = user.role === "super_admin" ? listUsers().length : null;
  // 主卡展示我的宠物；未领养时展示宠物池第一只，池空则纯文案
  const pet = getMyPet(user.id)?.pet ?? listPets()[0] ?? null;

  // 卡片级联入场延迟（ms）
  const delays = [80, 140, 200, 260, 320, 380, 440];

  const cardCls =
    "card-hover anim-card group relative rounded-2xl border border-line bg-card p-5 shadow-card";
  const iconCls =
    "flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform duration-200 group-hover:scale-110 [&>svg]:h-5 [&>svg]:w-5";

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="anim-card mb-8 md:mb-10">
        <p className="text-sm text-muted">{dateFmt.format(new Date())}</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-wide text-fg md:text-4xl">
          {greeting()}，{user.username}
        </h1>
        <p className="mt-2 text-sm text-muted">今天想从哪里开始？</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* 主卡：宠物（青绿渐变底 + 高光扫过 + 装饰圆环 + 宠物漂浮） */}
        <Link
          href="/pets"
          className="card-hover anim-card bg-grad-accent anim-grad relative col-span-2 row-span-2 overflow-hidden rounded-3xl p-6 text-white shadow-lift"
          style={{ animationDelay: `${delays[0]}ms` }}
        >
          <div className="anim-shimmer pointer-events-none absolute inset-0" />
          {/* 装饰圆环，给大面积渐变一点层次 */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full border-[18px] border-white/10" />
          <div className="relative flex h-full flex-col justify-between gap-4">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm [&>svg]:h-5 [&>svg]:w-5">
                {NAV_ICONS["宠物"]}
              </div>
              <div className="mt-4 font-display text-2xl font-bold tracking-wide md:text-3xl">宠物</div>
              <p className="mt-1.5 max-w-52 text-sm leading-relaxed text-white/85">
                {pet ? `来看看 ${pet.name} 今天过得怎么样` : "领养一只 yoyo 酱，陪它聊天成长"}
              </p>
            </div>
            {pet && (
              // eslint-disable-next-line @next/next/no-img-element -- 宠物图为动态接口资源
              <img
                src={petImageUrl(pet, "idle")}
                alt={pet.name}
                className="absolute -bottom-2 -right-2 h-28 w-28 object-contain drop-shadow-[0_8px_24px_rgb(0_0_0/0.3)] md:h-36 md:w-36"
                style={{ animation: "ws-float 7s ease-in-out infinite" }}
              />
            )}
          </div>
        </Link>

        <Link href="/knowledge" className={`${cardCls} col-span-2`} style={{ animationDelay: `${delays[1]}ms` }}>
          <ArrowLink />
          <div className="flex items-center gap-3.5">
            <span className={iconCls}>{NAV_ICONS["知识库"]}</span>
            <div>
              <div className="font-display text-sm font-semibold text-fg">知识库</div>
              <p className="mt-0.5 text-xs text-muted">Markdown 笔记、标签与图谱</p>
            </div>
          </div>
        </Link>

        <Link href="/models" className={cardCls} style={{ animationDelay: `${delays[2]}ms` }}>
          <ArrowLink />
          <span className={iconCls}>{NAV_ICONS["模型"]}</span>
          <div className="mt-4 font-display text-3xl font-bold tabular-nums text-fg">{myPresetCount}</div>
          <div className="mt-0.5 text-xs text-muted">模型预设</div>
        </Link>

        <Link href="/prompts" className={cardCls} style={{ animationDelay: `${delays[3]}ms` }}>
          <ArrowLink />
          <span className={iconCls}>{NAV_ICONS["提示词"]}</span>
          <div className="mt-4 font-display text-sm font-semibold text-fg">提示词</div>
          <div className="mt-0.5 text-xs text-muted">分组模板管理</div>
        </Link>

        <Link href="/tools" className={cardCls} style={{ animationDelay: `${delays[4]}ms` }}>
          <ArrowLink />
          <span className={iconCls}>{NAV_ICONS["AI 工具"]}</span>
          <div className="mt-4 font-display text-sm font-semibold text-fg">AI 工具</div>
          <div className="mt-0.5 text-xs text-muted">本机与远程设备工具</div>
        </Link>

        <Link href="/unity" className={cardCls} style={{ animationDelay: `${delays[5]}ms` }}>
          <ArrowLink />
          <span className={iconCls}>{NAV_ICONS["Unity 控制"]}</span>
          <div className="mt-4 font-display text-sm font-semibold text-fg">Unity 控制</div>
          <div className="mt-0.5 text-xs text-muted">本机桥接执行命令</div>
        </Link>

        {userCount !== null && (
          <Link href="/users" className={cardCls} style={{ animationDelay: `${delays[6]}ms` }}>
            <ArrowLink />
            <span className={iconCls}>{NAV_ICONS["用户管理"]}</span>
            <div className="mt-4 font-display text-3xl font-bold tabular-nums text-fg">{userCount}</div>
            <div className="mt-0.5 text-xs text-muted">用户总数</div>
          </Link>
        )}
      </div>
    </div>
  );
}
