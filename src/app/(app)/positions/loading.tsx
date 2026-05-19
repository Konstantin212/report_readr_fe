import { Card } from "@/components/pulse/card";

/**
 * Skeleton shown by Next.js automatically while /positions data is being
 * loaded. Without it the user clicks a row and sees the *previous* page
 * frozen for 2-4 s; this drops the visible wait to zero by streaming a
 * shell immediately and swapping in the real content when data lands.
 */
export default function PositionsLoading() {
  return (
    <main className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-7 w-56 bg-panel2 rounded" />
        <div className="flex-1" />
        <div className="h-8 w-32 bg-panel2 rounded-md" />
        <div className="h-8 w-32 bg-panel2 rounded-md" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex justify-between items-center">
          <div className="h-4 w-20 bg-panel2 rounded" />
          <div className="h-4 w-24 bg-panel2 rounded" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1.5fr_0.55fr_0.5fr_0.65fr_0.65fr_0.85fr_0.85fr_0.85fr_0.55fr] gap-0 px-5 py-3 items-center border-b border-border last:border-b-0"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-panel2" />
              <div>
                <div className="h-3 w-16 bg-panel2 rounded mb-1" />
                <div className="h-2.5 w-24 bg-panel2 rounded" />
              </div>
            </div>
            <div className="h-3 w-10 bg-panel2 rounded justify-self-start" />
            <div className="h-3 w-12 bg-panel2 rounded justify-self-end" />
            <div className="h-3 w-12 bg-panel2 rounded justify-self-end" />
            <div className="h-3 w-12 bg-panel2 rounded justify-self-end" />
            <div className="h-3 w-16 bg-panel2 rounded justify-self-end" />
            <div className="h-3 w-16 bg-panel2 rounded justify-self-end" />
            <div className="h-3 w-16 bg-panel2 rounded justify-self-end" />
            <div className="h-3 w-10 bg-panel2 rounded justify-self-end" />
          </div>
        ))}
      </Card>
    </main>
  );
}
