import type { PetAppearance } from "@/lib/pet-types";

/**
 * 解析宠物某个显示表情的图片地址：
 * 优先外观配置（stateMap 映射 → 表情槽文件，或同名表情槽），
 * 无自定义时回退内置 /pet/<expr>.png（idle/petted/sleepy/hungry/eating 五张）。
 */
export function petImageUrl(
  pet: { id: string; appearance?: PetAppearance },
  expr: string
): string {
  const ap = pet.appearance ?? {};
  const mapped = (ap.stateMap as Record<string, string> | undefined)?.[expr];
  const file = (mapped ? ap.expressions?.[mapped] : undefined) ?? ap.expressions?.[expr];
  if (file) return `/api/pets/${pet.id}/assets/${encodeURIComponent(file)}`;
  return `/pet/${expr}.png`;
}
