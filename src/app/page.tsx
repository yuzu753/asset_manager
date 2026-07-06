import { AssetDashboard } from "@/components/AssetDashboard";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <AssetDashboard />
      </div>
    </div>
  );
}
