"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

export default function KnowledgePanel({ value, onChange, onClose }: Props) {
  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-fg">全局知识库</span>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 text-xs text-muted">
          本工作流的全局知识，所有节点均可访问：模板中用{" "}
          <code className="rounded bg-subtle px-1 text-fg">{"{{knowledge}}"}</code>{" "}
          引用，代码/条件节点中使用 <code className="rounded bg-subtle px-1 text-fg">knowledge</code>{" "}
          变量。内容是 JSON 时会自动解析，可用{" "}
          <code className="rounded bg-subtle px-1 text-fg">{"{{knowledge.field}}"}</code> 取字段。
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          placeholder={'填写知识内容，纯文本或 JSON，如：\n{"产品": "工作台", "owner": "我"}'}
          className="w-full resize-y rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </div>
    </div>
  );
}
