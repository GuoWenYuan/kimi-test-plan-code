import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { adjustExpressionImage } from "@/lib/pet-image-gen";
import { getPetById, updatePetSettings } from "@/lib/pet-store";

/**
 * 反复调整一张外观图（RightAPI 不支持 edits，走固定角色描述 + 累积提示词重绘）：
 * 取出 appearance.prompts[file] 的累积描述，拼接本次修改意见后重绘，
 * 覆盖写回原文件名——expressions/stateMap 引用全部不变。owner 或超管。
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

  const body = (await req.json().catch(() => null)) as { file?: string; instruction?: string } | null;
  const file = String(body?.file ?? "");
  const instruction = String(body?.instruction ?? "").trim().slice(0, 300);
  if (!file || file !== path.basename(file)) {
    return NextResponse.json({ error: "文件名非法" }, { status: 400 });
  }
  if (!instruction) return NextResponse.json({ error: "请描述要怎么调整" }, { status: 400 });
  const appearance = result.pet.appearance;
  if (!Object.values(appearance.expressions ?? {}).includes(file)) {
    return NextResponse.json({ error: "这张图不在表情槽里" }, { status: 404 });
  }

  const previous = appearance.prompts?.[file];
  const accumulated = previous ? `${previous}; additionally: ${instruction}` : instruction;
  try {
    await adjustExpressionImage(id, file, accumulated);
    const pet = updatePetSettings(id, {
      appearance: {
        expressions: appearance.expressions ?? {},
        stateMap: appearance.stateMap ?? {},
        prompts: { ...appearance.prompts, [file]: accumulated },
      },
    });
    return NextResponse.json({ pet, file });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "调整失败" },
      { status: 502 }
    );
  }
}
