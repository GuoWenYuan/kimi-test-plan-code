import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  group: string;
  createdAt: string;
}

export interface PromptsData {
  groups: string[];
  templates: PromptTemplate[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "prompts.json");

export const DEFAULT_GROUP = "默认";
const DEFAULT_GROUPS = [DEFAULT_GROUP, "程序", "写作"];

const DEFAULT_TEMPLATES: Omit<PromptTemplate, "id" | "createdAt">[] = [
  {
    name: "内容摘要",
    description: "对输入内容做简明摘要",
    group: "默认",
    content: "请对以下内容进行简明扼要的摘要，保留关键信息：\n\n{{input}}",
  },
  {
    name: "JSON 信息提取",
    description: "从内容中提取字段并以 JSON 返回",
    group: "程序",
    content:
      "请从以下内容中提取关键信息，严格以 JSON 对象格式返回，不要输出多余文字：\n\n{{input}}",
  },
  {
    name: "分类打标",
    description: "对内容进行分类并给出标签",
    group: "程序",
    content:
      '请对以下内容进行分类，以 JSON 返回，格式：{"category": "分类", "tags": ["标签1", "标签2"]}：\n\n{{input}}',
  },
  {
    name: "翻译为英文",
    description: "将输入内容翻译为英文",
    group: "写作",
    content: "请将以下内容翻译为流畅自然的英文，只输出译文：\n\n{{input}}",
  },
  {
    name: "润色改写",
    description: "改写内容使其更通顺专业",
    group: "写作",
    content: "请改写以下内容，使其表达更通顺、专业，保持原意不变：\n\n{{input}}",
  },
];

async function writeAll(data: PromptsData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** 读取并兼容旧格式（纯数组、无分组字段），返回规范化数据 */
async function readAll(): Promise<PromptsData> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf-8");
  } catch {
    // 首次使用：写入预置分组和模板
    const seeded: PromptsData = {
      groups: [...DEFAULT_GROUPS],
      templates: DEFAULT_TEMPLATES.map((t) => ({
        ...t,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      })),
    };
    await writeAll(seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    // 旧格式：直接是模板数组
    if (Array.isArray(parsed)) {
      const migrated: PromptsData = {
        groups: [...DEFAULT_GROUPS],
        templates: parsed.map((t) => ({ ...t, group: t.group ?? DEFAULT_GROUP })),
      };
      await writeAll(migrated);
      return migrated;
    }
    const data = parsed as PromptsData;
    return {
      groups: Array.isArray(data.groups) && data.groups.length ? data.groups : [...DEFAULT_GROUPS],
      templates: (data.templates ?? []).map((t) => ({ ...t, group: t.group ?? DEFAULT_GROUP })),
    };
  } catch {
    return { groups: [...DEFAULT_GROUPS], templates: [] };
  }
}

export async function getPromptsData(): Promise<PromptsData> {
  return readAll();
}

export async function createTemplate(
  input: Omit<PromptTemplate, "id" | "createdAt">
): Promise<PromptTemplate> {
  const data = await readAll();
  const group = input.group || DEFAULT_GROUP;
  if (!data.groups.includes(group)) data.groups.push(group);
  const tpl: PromptTemplate = {
    ...input,
    group,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  data.templates.push(tpl);
  await writeAll(data);
  return tpl;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<PromptTemplate, "id" | "createdAt">>
): Promise<PromptTemplate | undefined> {
  const data = await readAll();
  const idx = data.templates.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  data.templates[idx] = { ...data.templates[idx], ...patch };
  await writeAll(data);
  return data.templates[idx];
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const data = await readAll();
  const next = data.templates.filter((t) => t.id !== id);
  if (next.length === data.templates.length) return false;
  data.templates = next;
  await writeAll(data);
  return true;
}

export async function addGroup(name: string): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "分组名不能为空" };
  const data = await readAll();
  if (data.groups.includes(trimmed)) return { error: "分组已存在" };
  data.groups.push(trimmed);
  await writeAll(data);
  return {};
}

/** 删除分组：组内模板移入默认分组；默认分组不可删除 */
export async function deleteGroup(name: string): Promise<{ error?: string }> {
  if (name === DEFAULT_GROUP) return { error: "默认分组不可删除" };
  const data = await readAll();
  if (!data.groups.includes(name)) return { error: "分组不存在" };
  data.groups = data.groups.filter((g) => g !== name);
  data.templates = data.templates.map((t) =>
    t.group === name ? { ...t, group: DEFAULT_GROUP } : t
  );
  await writeAll(data);
  return {};
}
