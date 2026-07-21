import { Card } from "@/components/pulse/card";

export default function ElsterLoading() {
  return (
    <main className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-7 w-48 bg-panel2 rounded" />
        <div className="flex-1" />
        <div className="h-8 w-32 bg-panel2 rounded-md" />
      </div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <Card>
          <div className="grid grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div className="h-3 w-20 bg-panel2 rounded mb-2" />
                <div className="h-9 w-24 bg-panel2 rounded" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="h-4 w-32 bg-panel2 rounded mb-3" />
          <div className="h-3 bg-panel2/60 rounded mb-2" />
          <div className="h-3 w-3/4 bg-panel2/60 rounded mb-4" />
          <div className="h-[10px] bg-panel2/40 rounded-full" />
        </Card>
      </div>
      <Card className="p-0">
        <div className="p-5 border-b border-border h-12" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-border h-10" />
        ))}
      </Card>
    </main>
  );
}
