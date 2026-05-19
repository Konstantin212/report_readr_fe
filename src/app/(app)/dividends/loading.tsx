import { Card } from "@/components/pulse/card";

export default function DividendsLoading() {
  return (
    <main className="space-y-4 animate-pulse">
      <div className="h-7 w-40 bg-panel2 rounded" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <div className="h-3 w-16 bg-panel2 rounded mb-2" />
            <div className="h-7 w-20 bg-panel2 rounded" />
          </Card>
        ))}
      </div>
      <Card>
        <div className="h-[180px] bg-panel2/40 rounded" />
      </Card>
    </main>
  );
}
