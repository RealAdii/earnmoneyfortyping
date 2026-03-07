"use client";

import dynamic from "next/dynamic";

const TypingGame = dynamic(() => import("@/components/TypingGame"), {
  ssr: false,
});

const ComingSoon = dynamic(() => import("@/components/ComingSoon"), {
  ssr: false,
});

const IS_COMING_SOON = false; // flip to true for coming soon page

export default function Home() {
  if (IS_COMING_SOON) {
    return <ComingSoon />;
  }

  return (
    <div className="container">
      <TypingGame />
    </div>
  );
}
