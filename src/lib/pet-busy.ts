/**
 * 宠物占用锁：同一时刻只让一个进程占用宠物的 pi 会话。
 * 用户聊天与定时任务共用；任务发现宠物忙碌会让道（下一拍重试）。
 * globalThis 单例，跨路由/模块共享。
 */

const busyPets: Set<string> = (() => {
  const g = globalThis as unknown as { __petBusyPets?: Set<string> };
  if (!g.__petBusyPets) g.__petBusyPets = new Set();
  return g.__petBusyPets;
})();

export function isPetBusy(petId: string): boolean {
  return busyPets.has(petId);
}

/** 占用宠物，返回释放函数（务必在 finally 中调用） */
export function acquirePetBusy(petId: string): () => void {
  busyPets.add(petId);
  return () => {
    busyPets.delete(petId);
  };
}
