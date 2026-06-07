"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./contexts/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/workspace");
      } else {
        router.replace("/login");
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-8 h-8 mx-auto mb-3 border-2 border-[--nuss-accent]/30 border-t-[--nuss-accent] rounded-full animate-spin" />
        <p className="text-sm text-[--nuss-muted]">加载中...</p>
      </div>
    </div>
  );
}
