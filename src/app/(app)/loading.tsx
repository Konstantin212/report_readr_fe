import { Card } from "@/components/pulse/card";

export default function DashboardLoading() {
  return (
    <main className="space-y-4 animate-pulse">
      <Card>
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-panel2 rounded mb-2" />
              <div className="h-10 w-32 bg-panel2 rounded" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Card>
          <div className="h-[260px] bg-panel2/40 rounded" />
        </Card>
        <Card>
          <div className="h-4 w-24 bg-panel2 rounded mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-panel2/50 rounded" />
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
