"use client";

import { NODE_DEFS } from "./nodeDefs";
import type { WorkNode } from "./WorkNodeView";

interface Props {
  node: WorkNode | null;
  onChange: (id: string, patch: { label?: string; config?: Record<string, string> }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function ConfigPanel({ node, onChange, onDelete, onClose }: Props) {
  if (!node) return null;
  const def = NODE_DEFS[node.data.kind];

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded text-xs text-white ${def.color}`}
          >
            {def.icon}
          </span>
          <span className="text-sm font-medium text-neutral-800">{def.title}节点</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">节点名称</span>
          <input
            value={node.data.label}
            onChange={(e) => onChange(node.id, { label: e.target.value })}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </label>

        {def.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">
              {field.label}
            </span>
            {field.multiline ? (
              <textarea
                rows={4}
                value={node.data.config[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) =>
                  onChange(node.id, {
                    config: { ...node.data.config, [field.key]: e.target.value },
                  })
                }
                className="w-full resize-y rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            ) : (
              <input
                value={node.data.config[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) =>
                  onChange(node.id, {
                    config: { ...node.data.config, [field.key]: e.target.value },
                  })
                }
                className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            )}
          </label>
        ))}
      </div>

      {node.data.kind !== "start" && node.data.kind !== "end" && (
        <div className="border-t border-neutral-100 p-3">
          <button
            onClick={() => onDelete(node.id)}
            className="w-full rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 transition-colors hover:bg-rose-50"
          >
            删除节点
          </button>
        </div>
      )}
    </div>
  );
}
