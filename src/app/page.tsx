const CARDS = [
  {
    icon: "🔁",
    title: "最近工作流",
    description: "这里会展示你最近使用的工作流。",
    href: "/workflows",
  },
  {
    icon: "📚",
    title: "知识库速览",
    description: "这里会展示最近沉淀的知识条目。",
    href: "/knowledge",
  },
  {
    icon: "⚡",
    title: "快捷操作",
    description: "常用操作的入口，后续可自定义。",
    href: "/",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">工作台</h1>
      <p className="mt-1 text-sm text-neutral-500">
        欢迎回来。这里是你的个人工作台，用于沉淀工作流与知识库。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <a
            key={card.title}
            href={card.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm"
          >
            <div className="text-2xl">{card.icon}</div>
            <h2 className="mt-3 text-sm font-medium">{card.title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{card.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
