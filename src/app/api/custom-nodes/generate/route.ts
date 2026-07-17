import { NextResponse } from "next/server";
import { getPreset } from "@/lib/models-store";
import { createChatModel } from "@/lib/llm";
import { getCurrentUser } from "@/lib/auth";

const SYSTEM_PROMPT = `你是工作流节点生成器。根据用户需求生成一个可复用的工作流节点定义，严格输出 JSON，不要输出任何其他文字。

输出格式（严格遵守）：
{
  "name": "节点名称（简短，如：文本摘要器）",
  "description": "一句话说明节点做什么",
  "mode": "llm 或 code",
  "content": "节点内容"
}

规则：
- mode=llm：content 是提示词模板，节点运行时会把它发给大模型。模板中可用 {{input}} 引用上游 JSON 数据、{{input.field}} 取字段、{{knowledge}} 引用知识库。适合摘要/翻译/提取/分类/改写等任务
- mode=code：content 是 JavaScript 代码。可用变量：input（上游 JSON）、outputs（所有上游输出）、knowledge（知识库）；结果必须赋值给 output。适合格式转换/统计/过滤等确定性任务
- 优先选 llm，只有需求是明确的确定性逻辑才选 code`;

interface GenSpec {
  name: string;
  description?: string;
  mode: "llm" | "code";
  content: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { requirement, presetId } = body ?? {};
  if (!requirement || typeof requirement !== "string") {
    return NextResponse.json({ error: "请描述节点要做什么" }, { status: 400 });
  }
  if (!presetId) {
    return NextResponse.json({ error: "请选择模型预设" }, { status: 400 });
  }
  const preset = await getPreset(user.id, presetId);
  if (!preset) {
    return NextResponse.json({ error: "模型预设不存在" }, { status: 404 });
  }

  try {
    const model = createChatModel(preset);
    const res = await model.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `节点需求：${requirement}` },
    ]);
    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回中未找到 JSON");
    const spec = JSON.parse(match[0]) as GenSpec;
    if (!spec.name || !spec.content || (spec.mode !== "llm" && spec.mode !== "code")) {
      throw new Error("模型返回的节点定义不完整");
    }
    return NextResponse.json({ spec });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
