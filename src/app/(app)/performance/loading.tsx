import { Card } from "@/components/pulse/card";

export default function PerformanceLoading() {
  return (
    <main className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-7 w-48 bg-panel2 rounded" />
        <div className="flex-1" />
        <div className="h-8 w-48 bg-panel2 rounded-md" />
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="p-5 grid grid-cols-3 gap-4 border-b border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-panel2 rounded mb-2" />
              <div className="h-8 w-24 bg-panel2 rounded" />
            </div>
          ))}
        </div>
        <div className="h-[300px] bg-panel2/40" />
      </Card>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <div className="h-3 w-16 bg-panel2 rounded mb-2" />
            <div className="h-6 w-20 bg-panel2 rounded" />
          </Card>
        ))}
      </div>
    </main>
  );
}
