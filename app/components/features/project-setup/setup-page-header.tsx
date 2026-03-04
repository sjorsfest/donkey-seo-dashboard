import { Link } from "react-router";

export function SetupPageHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Guided Setup</p>
        <h1 className="font-display text-3xl font-bold text-slate-900">Create a new pipeline project</h1>
      </div>
      <Link to="/project" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
        Back to project
      </Link>
    </div>
  );
}

