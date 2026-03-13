"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/train");
  }, [router]);
  return null;
}
