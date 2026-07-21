"use client";

import type { NodeStatus } from "@/lib/workflow-engine";

export type RunDisplayStatus = NodeStatus | "running";

export interface RunLogItem {
  nodeId: string;
  label: string;
  result: { status: RunDisplayStatus; output?: string; error?: string };
}

interface Props {
  running: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onRun: () => void;
  log: RunLogItem[];
  /** 节点流式输出中的实时文本 */
  streamText: Record<string, string>;
  finalOutput?: string;
  success: boolean;
  error?: string;
  onClear: () => void;
  onClose: () => void;
}

const STATUS_TEXT: Record<RunDisplayStatus, { icon: string; text: string }> = {
  running: { icon: "⏳", text: "运行中" },
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
  streamText,
  finalOutput,
  success,
  error,
  onClear,
  onClose,
}: Props) {
  return (
    <div className="flex w-96 shrink-0 flex-col border-l border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-fg">试运行</span>
        <div className="flex items-center gap-1">
          {(log.length > 0 || finalOutput !== undefined || error) && !running && (
            <button
              onClick={onClear}
              className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
              title="清除运行结果与节点高亮"
            >
              🧹 清除缓存
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="border-b border-line p-4">
        <span className="mb-1 block text-xs font-medium text-muted">
          输入（传给开始节点）
        </span>
        <textarea
          rows={7}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder='输入文本或 JSON，如 {"text":"你好"}'
          className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <button
          onClick={onRun}
          disabled={running}
          className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {running ? "运行中…" : "▶ 运行"}
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {success && !running && !error && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
            ✅ 运行成功
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400">
            {error}
          </div>
        )}
        {log.map((item) => {
          const s = STATUS_TEXT[item.result.status];
          const live = streamText[item.nodeId];
          return (
            <div
              key={item.nodeId}
              className="rounded-lg border border-line bg-subtle p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-fg">{item.label}</span>
                <span className="text-xs text-muted">
                  {s.icon} {s.text}
                </span>
              </div>
              {live && (
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-accent-soft p-2 text-xs text-fg">
                  {live}
                  <span className="animate-pulse">▌</span>
                </pre>
              )}
              {!live && item.result.output && (
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-card p-2 text-xs text-muted">
                  {item.result.output}
                </pre>
              )}
              {item.result.error && (
                <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
                  {item.result.error}
                </pre>
              )}
            </div>
          );
        })}
        {finalOutput !== undefined && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/15">
            <div className="text-xs font-medium text-emerald-800 dark:text-emerald-400">最终输出</div>
            <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-xs text-emerald-900 dark:text-emerald-300">
              {finalOutput}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
