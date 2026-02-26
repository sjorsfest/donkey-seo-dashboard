import { Outlet } from "react-router";

const features = [
  {
    icon: "🔍",
    title: "Keyword research on autopilot",
    description: "Discover high-impact keywords while you focus on strategy.",
  },
  {
    icon: "✍️",
    title: "Content that converts",
    description: "AI-powered articles optimized for search and engagement.",
  },
  {
    icon: "🚀",
    title: "Zero busywork",
    description: "From research to publication, completely hands-off.",
  },
];

export default function AuthLayout() {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <div className="relative w-full max-w-6xl grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-center">
        <div className="hidden lg:flex flex-col gap-10">
          <div>
            <h1 className="font-display text-5xl font-black mb-4 leading-[1.1]">
              <span className="text-outline-hero">SEO content</span> that
              <br />
              <span className="text-outline" style={{ color: '#86c4ad' }}>
                brings you leads
              </span>
            </h1>
            <p className="text-slate-600 text-lg font-medium leading-relaxed mb-10">
              Automated keyword research, content creation, and CMS delivery. From setup to published articles.{" "}
              <span className="font-semibold text-slate-900">Completely hands-off.</span>
            </p>

            <div className="space-y-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3 group">
                  <div className={`w-10 h-10 rounded-xl shadow-md flex items-center justify-center text-xl transform group-hover:scale-110 transition-transform duration-300 ${
                    index % 2 === 0
                      ? "bg-gradient-to-br from-yellow-200 to-yellow-300"
                      : "bg-gradient-to-br from-yellow-100 to-yellow-200"
                  }`}>
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 text-sm mb-0.5">
                      {feature.title}
                    </p>
                    <p className="text-slate-600 text-xs leading-snug">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative w-full aspect-[4/3] bg-white rounded-2xl shadow-2xl border-2 border-slate-200 overflow-hidden transform hover:rotate-1 transition-transform">
            <div className="h-9 bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-200 flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-400 shadow-sm" />
              <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm" />
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm" />
            </div>
            <img
              src="/static/homepage.png"
              alt="Dashboard Preview"
              className="absolute inset-0 top-[37px] w-full h-full object-contain object-top"
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
