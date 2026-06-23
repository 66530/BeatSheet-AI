import { Suspense, type ReactNode } from "react";
import WorkspaceProvider from "./_components/WorkspaceProvider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#0D0C16]">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-[#00F0FF]/30 border-t-[#00F0FF] rounded-full animate-spin" />
          <p className="text-sm text-[#7876A0]">加载工作台...</p>
        </div>
      </div>
    }>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </Suspense>
  );
}
