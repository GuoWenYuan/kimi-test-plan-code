// template 会在每次路由切换时重新挂载，从而实现页面进入动效
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="anim-page h-full">{children}</div>;
}
