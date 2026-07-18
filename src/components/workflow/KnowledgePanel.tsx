"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

export default function KnowledgePanel({ value, onChange, onClose }: Props) {
  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="text-sm font-medium text-neutral-800">全局知识库</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 text-xs text-neutral-400">
          本工作流的全局知识，所有节点均可访问：模板中用{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{knowledge}}"}</code>{" "}
          引用，代码/条件节点中使用 <code className="rounded bg-neutral-100 px-1">knowledge</code>{" "}
          变量。内容是 JSON 时会自动解析，可用{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{knowledge.field}}"}</code> 取字段。
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          placeholder={'填写知识内容，纯文本或 JSON，如：\n{"产品": "工作台", "owner": "我"}'}
          className="w-full resize-y rounded-md border border-neutral-200 px-2.5 py-1.5 font-mono text-xs outline-none focus:border-blue-400"
        />
      </div>
    </div>
  );
}
