export default function KnowledgePage() {
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">知识库</h1>
      <p className="mt-1 text-sm text-neutral-500">
        记录和整理工作中的经验、笔记与资料，让知识持续积累。
      </p>

      <div className="mt-10 flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white py-16">
        <div className="text-3xl">📚</div>
        <p className="mt-3 text-sm font-medium text-neutral-700">
          知识库还是空的
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          知识条目管理功能将在后续版本中加入。
        </p>
      </div>
    </div>
  );
}
