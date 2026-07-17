export default function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-6">
      <div className="flex-1">
        <input
          type="search"
          placeholder="全局搜索（待接入）…"
          disabled
          className="w-full max-w-md rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 placeholder:text-neutral-400"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-sm text-neutral-500">
          我
        </div>
      </div>
    </header>
  );
}
