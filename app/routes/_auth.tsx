import { Outlet } from "react-router";

const features = [
  {
    title: "Real pipelines, zero fluff",
    description: "Kick off your SEO pipeline without wrestling a complex UI.",
  },
  {
    title: "Project-first workflow",
    description: "Create projects fast and keep your runs organized.",
  },
  {
    title: "Built for momentum",
    description: "Start, pause, and iterate with minimal friction.",
  },
];

export default function AuthLayout() {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-6">
      <div className="relative w-full max-w-5xl grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="hidden lg:flex flex-col gap-8 rounded-3xl border border-white/40 bg-white/60 p-8 text-slate-900 shadow-xl backdrop-blur-md">
          <div>
            <h1 className="font-display text-4xl font-bold mb-8 text-slate-900">
              DonkeySEO makes pipelines feel easy.
            </h1>

            <div className="space-y-4 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="mt-1 w-8 h-8 rounded-lg bg-white border-2 border-slate-100 shadow-sm flex items-center justify-center text-lg">
                    ✨
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm tracking-tight">
                      {feature.title}
                    </p>
                    <p className="text-slate-500 text-xs font-medium leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative w-full aspect-[4/3] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden transform rotate-1">
            <div className="h-8 bg-slate-50 border-b border-slate-100 flex items-center px-3 gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <img
              src="/static/homepage.png"
              alt="Dashboard Preview"
              className="absolute inset-0 top-[33px] w-full h-full object-contain object-top"
            />
          </div>
        </div>

        <div className="w-full max-w-md mx-auto lg:ml-auto lg:mr-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
