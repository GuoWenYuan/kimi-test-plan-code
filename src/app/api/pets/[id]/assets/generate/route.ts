import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateExpressionImage } from "@/lib/pet-image-gen";
import { getPetById, updatePetSettings } from "@/lib/pet-store";

/**
 * AI 生成表情（RightAPI gpt 生图，owner 或超管）：
 * 按固定角色描述 + 用户给的表情/动作提示生成透明底 PNG，
 * 存入宠物 assets 并登记为同名表情槽。生图较慢（30-60s），前端需给足等待提示。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return NextResponse.json({ error: "宠物不存在" }, { status: 404 });
  if (result.pet.ownerUserId !== user.id && user.role !== "super_admin") {
    return NextResponse.json({ error: "只有主人或管理员可以管理外观" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { name?: string; hint?: string } | null;
  const name = String(body?.name ?? "").trim().slice(0, 12);
  if (!name) return NextResponse.json({ error: "表情名不能为空" }, { status: 400 });
  const appearance = result.pet.appearance;
  if (appearance.expressions?.[name]) {
    return NextResponse.json({ error: "已存在同名表情" }, { status: 400 });
  }

  try {
    const hint = String(body?.hint ?? "").trim();
    const file = await generateExpressionImage(id, name, hint);
    const pet = updatePetSettings(id, {
      appearance: {
        expressions: { ...appearance.expressions, [name]: file },
        stateMap: appearance.stateMap ?? {},
        // 记录累积生成描述，之后「调整」这张图时拼接沿用
        prompts: { ...appearance.prompts, [file]: hint || "standing still with a gentle smile, relaxed" },
      },
    });
    return NextResponse.json({ pet, file });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "生成失败" },
      { status: 502 }
    );
  }
}
