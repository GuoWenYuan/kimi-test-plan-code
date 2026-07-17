"use client";

import type { NodeResult } from "@/lib/workflow-engine";

export interface RunLogItem {
  nodeId: string;
  label: string;
  result: NodeResult;
}

interface Props {
  running: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onRun: () => void;
  log: RunLogItem[];
  finalOutput?: string;
  error?: string;
  onClose: () => void;
}

const STATUS_TEXT: Record<NodeResult["status"], { icon: string; text: string }> = {
  success: { icon: "✅", text: "成功" },
  error: { icon: "❌", text: "失败" },
  skipped: { icon: "⏭️", text: "跳过" },
};

export default function RunPanel({
  running,
  input,
  onInputChange,
  onRun,
  log,
  finalOutput,
  error,
  onClose,
}: Props) {
  return (
    <div className="flex w-96 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="text-sm font-medium text-neutral-800">试运行</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-neutral-100 p-4">
        <span className="mb-1 block text-xs font-medium text-neutral-500">
          输入（传给开始节点）
        </span>
        <textarea
          rows={7}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder='输入文本或 JSON，如 {"text":"你好"}'
          className="w-full resize-y rounded-md border border-neutral-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-400"
        />
        <button
          onClick={onRun}
          disabled={running}
          className="mt-2 w-full rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {running ? "运行中…" : "▶ 运行"}
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}
        {log.map((item) => {
          const s = STATUS_TEXT[item.result.status];
          return (
            <div
              key={item.nodeId}
              className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-700">{item.label}</span>
                <span className="text-xs text-neutral-400">
                  {s.icon} {s.text}
                </span>
              </div>
              {item.result.output && (
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-xs text-neutral-600">
                  {item.result.output}
                </pre>
              )}
              {item.result.error && (
                <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-rose-50 p-2 text-xs text-rose-700">
                  {item.result.error}
                </pre>
              )}
            </div>
          );
        })}
        {finalOutput !== undefined && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-medium text-emerald-800">最终输出</div>
            <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-xs text-emerald-900">
              {finalOutput}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
