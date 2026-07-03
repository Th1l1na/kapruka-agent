import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Home() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex items-center gap-2 border-b border-black/5 py-4 dark:border-white/10">
        <span className="text-xl">🎁</span>
        <div>
          <h1 className="text-base font-semibold leading-tight">
            Kapruka Gift Assistant
          </h1>
          <p className="text-xs text-neutral-500">
            Find and send the perfect gift across Sri Lanka.
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 pb-4">
        <ChatPanel />
      </div>
    </main>
  );
}
