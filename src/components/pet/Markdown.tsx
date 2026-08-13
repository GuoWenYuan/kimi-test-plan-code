import React from "react";

/**
 * 零依赖的轻量 Markdown 渲染器（React 节点输出，不拼 HTML，天然防注入）。
 * 支持：标题、代码块、行内代码、加粗/斜体/删除线、链接、无序/有序列表、
 * 引用、分割线、简单表格、段落与换行。够预览工作区文档用，不追求完整 CommonMark。
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 依次匹配：行内代码、链接、图片(alt)、加粗、斜体、删除线
  const re = /(`[^`\n]+`)|(\[([^\]]*)\]\((https?:[^)\s]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(~~([^~]+)~~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) {
      nodes.push(
        <code key={key} className="rounded bg-subtle px-1 py-0.5 text-[0.85em] text-fg">
          {m[1].slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      nodes.push(
        <a key={key} href={m[4]} target="_blank" rel="noreferrer" className="text-accent underline">
          {m[3] || m[4]}
        </a>,
      );
    } else if (m[5] || m[7]) {
      nodes.push(<strong key={key}>{m[6] ?? m[8]}</strong>);
    } else if (m[9] || m[11]) {
      nodes.push(<em key={key}>{m[10] ?? m[12]}</em>);
    } else if (m[13]) {
      nodes.push(<del key={key}>{m[14]}</del>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

function splitTableRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.trimStart().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) buf.push(lines[i++]);
      i++; // 跳过结束 ```
      blocks.push(
        <pre key={key++} className="my-2 overflow-auto rounded-lg bg-subtle p-3 text-xs text-fg">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // 表格：当前行 + 下一行是分隔行
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i++]));
      }
      blocks.push(
        <table key={key++} className="my-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              {header.map((h, j) => (
                <th key={j} className="border border-line bg-subtle px-2 py-1 text-left text-fg">
                  {renderInline(h, `th${j}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className="border border-line px-2 py-1 text-fg">
                    {renderInline(c, `td${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-4 mb-2 text-xl font-bold"
          : level === 2
            ? "mt-4 mb-2 text-lg font-bold"
            : "mt-3 mb-1.5 text-base font-semibold";
      blocks.push(
        <p key={key++} className={`${cls} text-fg`}>
          {renderInline(h[2], `h${key}`)}
        </p>,
      );
      i++;
      continue;
    }

    // 分割线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-3 border-line" />);
      i++;
      continue;
    }

    // 引用块（连续 > 行）
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="my-2 border-l-2 border-accent pl-3 text-sm text-muted">
          {buf.map((l, j) => (
            <p key={j} className="my-0.5">
              {renderInline(l, `q${key}-${j}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // 列表（连续 -/*/+/数字. 行，支持一层缩进）
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: { indent: boolean; ordered: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])!;
        items.push({ indent: m[1].length >= 2, ordered: /\d/.test(m[2]), text: m[3] });
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-2 space-y-0.5 text-sm text-fg">
          {items.map((it, j) => (
            <li
              key={j}
              className={it.indent ? "ml-6 list-[circle]" : it.ordered ? "ml-4 list-decimal" : "ml-4 list-disc"}
            >
              {renderInline(it.text, `li${key}-${j}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 段落：连续普通行合并，行尾两个空格或全部软换行都换成 <br>
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+\.)\s)/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="my-1.5 text-sm leading-6 text-fg">
        {buf.map((l, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(l, `p${key}-${j}`)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
