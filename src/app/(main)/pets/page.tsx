"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Pet } from "@/lib/pet-types";
import { petImageUrl } from "@/components/pet/pet-image";

/** 宠物池列表页：查看所有宠物状态，领养待领养宠物，超管可新增宠物 */
export default function PetsPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [myPetId, setMyPetId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pets");
      if (!res.ok) return;
      const data = (await res.json()) as { pets: Pet[]; myPetId: string | null };
      setPets(data.pets);
      setMyPetId(data.myPetId);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // 拉当前用户角色（决定是否显示「新增宠物」）
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setIsAdmin(u?.role === "super_admin"))
      .catch(() => {});
  }, [refresh]);

  const adopt = async (petId: string) => {
    setError("");
    const res = await fetch(`/api/pets/${petId}/adopt`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "领养失败");
      return;
    }
    refresh();
  };

  const create = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "新增失败");
        return;
      }
      setNewName("");
      refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-fg">宠物</h1>
          <p className="mt-1 text-sm text-muted">宠物池里的每只宠物只有一位主人，被领养后就不会再发给别人</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新宠物名字"
              maxLength={12}
              className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button
              onClick={create}
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              新增宠物
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">加载中…</p>
      ) : pets.length === 0 ? (
        <p className="text-sm text-muted">宠物池还是空的，等管理员放几只进来吧。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((pet) => (
            <Link
              key={pet.id}
              href={`/pets/${pet.id}`}
              className="group card-hover rounded-2xl border border-line bg-card p-4 shadow-card"
            >
              <div className="flex items-start gap-4">
                <img
                  src={petImageUrl(pet, "idle")}
                  alt={pet.name}
                  className="h-20 w-20 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-bold text-fg">{pet.name}</span>
                    {pet.id === myPetId && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-white">我的</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {pet.ownerName ? `主人：${pet.ownerName}` : "待领养"}
                  </p>
                </div>
              </div>
              {!pet.ownerUserId && !myPetId && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    adopt(pet.id);
                  }}
                  className="mt-3 w-full rounded-lg bg-accent py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  领养
                </button>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
