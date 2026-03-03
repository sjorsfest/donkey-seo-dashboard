import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { RouteErrorBoundaryCard } from "~/components/errors/route-error-boundary";
import "./app.css";

const SITE_NAME = "Donkey SEO";
const DEFAULT_IMAGE_PATH = "/static/homepage.png";
const DEFAULT_IMAGE_ALT = "Donkey SEO dashboard preview";
const OG_IMAGE_WIDTH = "1418";
const OG_IMAGE_HEIGHT = "976";
const INDEXABLE_PATHS = new Set(["/login", "/register"]);

type SeoData = {
  title: string;
  description: string;
  robots: string;
  canonicalUrl: string;
  siteOrigin: string;
  imageUrl: string;
  isIndexable: boolean;
};

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function resolveRequestOrigin(request: Request, url: URL) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || url.protocol.replace(":", "");
  const host = forwardedHost || request.headers.get("host") || url.host;
  return `${protocol}://${host}`;
}

function resolveSiteOrigin(request: Request, url: URL) {
  const configuredSiteUrl =
    process.env.SITE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    "";

  if (configuredSiteUrl) {
    try {
      const parsed = new URL(configuredSiteUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Fall through to request-derived origin for invalid configured values.
    }
  }

  return resolveRequestOrigin(request, url);
}

function buildSeoData(pathname: string, siteOrigin: string): SeoData {
  const isIndexable = INDEXABLE_PATHS.has(pathname);
  const imageUrl = `${siteOrigin}${DEFAULT_IMAGE_PATH}`;
  const canonicalUrl = `${siteOrigin}${pathname === "/" ? "/" : pathname}`;

  if (pathname === "/login") {
    return {
      title: "AI SEO Content Automation Platform | Donkey SEO",
      description:
        "Automate keyword research, topic discovery, article creation, and publishing workflows from a single SEO platform.",
      robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      canonicalUrl,
      siteOrigin,
      imageUrl,
      isIndexable,
    };
  }

  if (pathname === "/register") {
    return {
      title: "Create Your Donkey SEO Account | AI SEO Automation",
      description:
        "Create your Donkey SEO account to launch automated keyword research, SEO briefs, and content production pipelines.",
      robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      canonicalUrl,
      siteOrigin,
      imageUrl,
      isIndexable,
    };
  }

  if (pathname.startsWith("/projects") || pathname.startsWith("/project") || pathname === "/billing" || pathname === "/settings") {
    return {
      title: `Dashboard | ${SITE_NAME}`,
      description: "Manage SEO projects, keyword discovery, and AI-assisted content workflows in your Donkey SEO dashboard.",
      robots: "noindex, nofollow, noarchive, nosnippet",
      canonicalUrl,
      siteOrigin,
      imageUrl,
      isIndexable,
    };
  }

  return {
    title: `${SITE_NAME} | Automated SEO Content Workflows`,
    description:
      "Donkey SEO helps teams automate keyword research, content planning, and publishing-ready article generation.",
    robots: "noindex, nofollow, noarchive, nosnippet",
    canonicalUrl,
    siteOrigin,
    imageUrl,
    isIndexable,
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);
  const siteOrigin = resolveSiteOrigin(request, url);
  return buildSeoData(pathname, siteOrigin);
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/favicon-32x32.png", sizes: "32x32" },
  { rel: "icon", type: "image/png", href: "/favicon-16x16.png", sizes: "16x16" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  { rel: "manifest", href: "/site.webmanifest" },
];

export const meta: Route.MetaFunction = ({ data }) => {
  const seo = data as SeoData | undefined;
  const title = seo?.title ?? `${SITE_NAME} | Automated SEO Content Workflows`;
  const description =
    seo?.description ??
    "Donkey SEO helps teams automate keyword research, content planning, and publishing-ready article generation.";
  const robots = seo?.robots ?? "noindex, nofollow, noarchive, nosnippet";
  const canonicalUrl = seo?.canonicalUrl;
  const imageUrl = seo?.imageUrl;

  const descriptors: Route.MetaDescriptors = [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: "seo automation, ai seo, keyword research, topic discovery, content planning, automated content creation, seo dashboard" },
    { name: "robots", content: robots },
    { name: "googlebot", content: robots },
    { name: "referrer", content: "strict-origin-when-cross-origin" },
    { name: "format-detection", content: "telephone=no, email=no, address=no" },
    { name: "theme-color", content: "#86c4ad" },
    { name: "application-name", content: SITE_NAME },
    { name: "apple-mobile-web-app-title", content: SITE_NAME },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "msapplication-TileColor", content: "#86c4ad" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (canonicalUrl) {
    descriptors.push({ property: "og:url", content: canonicalUrl });
    descriptors.push({ name: "twitter:url", content: canonicalUrl });
    descriptors.push({ tagName: "link", rel: "canonical", href: canonicalUrl });
  }

  if (imageUrl) {
    descriptors.push({ property: "og:image", content: imageUrl });
    descriptors.push({ property: "og:image:type", content: "image/png" });
    descriptors.push({ property: "og:image:width", content: OG_IMAGE_WIDTH });
    descriptors.push({ property: "og:image:height", content: OG_IMAGE_HEIGHT });
    descriptors.push({ property: "og:image:alt", content: DEFAULT_IMAGE_ALT });
    descriptors.push({ name: "twitter:image", content: imageUrl });
    descriptors.push({ name: "twitter:image:alt", content: DEFAULT_IMAGE_ALT });
  }

  if (seo?.isIndexable && canonicalUrl && imageUrl) {
    descriptors.push({
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: canonicalUrl,
        image: imageUrl,
        description,
      },
    });
  }

  return descriptors;
};

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body className="h-full">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteErrorBoundaryCard
      error={error}
      variant="app"
      title="Application error"
      description="A page-level failure occurred while rendering Donkey SEO."
      safeHref="/login"
      safeLabel="Go to login"
      retryLabel="Retry page"
      showStatus
    />
  );
}
