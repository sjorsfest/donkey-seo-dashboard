import { Fragment, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Skeleton } from "~/components/ui/skeleton";
import { ExternalLink, FileX, User } from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirrors the backend modular_document contract)
// ---------------------------------------------------------------------------

type BlockLink = { href?: string; anchor?: string; label?: string };

type DocumentBlock = {
  block_type?: string;
  heading?: string;
  body?: string;
  level?: number;
  items?: string[];
  ordered?: boolean;
  table_columns?: string[];
  table_rows?: string[][];
  faq_items?: Array<{ question?: string; answer?: string }>;
  cta?: { label?: string; href?: string };
  links?: BlockLink[];
};

type ImageMetadata = {
  object_key?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  byte_size?: number;
  sha256?: string;
  signed_url?: string;
  title_text?: string;
  template_version?: string;
  source?: string;
  style_variant_id?: string;
};

type Author = {
  id?: string;
  name?: string;
  bio?: string;
  social_urls?: {
    linkedin?: string;
    x?: string;
  };
  basic_info?: {
    title?: string;
    location?: string;
  };
  profile_image?: ImageMetadata;
};

type ModularDocument = {
  seo_meta?: {
    h1?: string;
    meta_title?: string;
    meta_description?: string;
    slug?: string;
    primary_keyword?: string;
  };
  conversion_plan?: {
    primary_intent?: string;
    cta_strategy?: string[];
  };
  author?: Author;
  featured_image?: ImageMetadata;
  blocks?: DocumentBlock[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseDocument(raw: Record<string, unknown>): ModularDocument {
  return {
    seo_meta:
      typeof raw.seo_meta === "object" && raw.seo_meta !== null
        ? (raw.seo_meta as ModularDocument["seo_meta"])
        : undefined,
    conversion_plan:
      typeof raw.conversion_plan === "object" && raw.conversion_plan !== null
        ? (raw.conversion_plan as ModularDocument["conversion_plan"])
        : undefined,
    author:
      typeof raw.author === "object" && raw.author !== null
        ? (raw.author as ModularDocument["author"])
        : undefined,
    featured_image:
      typeof raw.featured_image === "object" && raw.featured_image !== null
        ? (raw.featured_image as ModularDocument["featured_image"])
        : undefined,
    blocks: safeArray<DocumentBlock>(raw.blocks),
  };
}

function headingTag(level: number | undefined): "h2" | "h3" | "h4" {
  if (!level || level < 2) return "h2";
  if (level > 4) return "h4";
  return `h${level}` as "h2" | "h3" | "h4";
}

const headingStyles: Record<string, string> = {
  h2: "text-[1.35rem] font-bold leading-snug text-slate-900",
  h3: "text-lg font-semibold leading-snug text-slate-800",
  h4: "text-base font-semibold leading-snug text-slate-700",
};

const INLINE_MARKDOWN_PATTERN = /(\[[^\]]+\]\((?:https?:\/\/[^\s)]+|#[^)]+)\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
const LINK_MARKDOWN_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;
const FENCED_CODE_BLOCK_PATTERN = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;

type MarkdownBlock = {
  type: "paragraph" | "code";
  value: string;
  language?: string;
};

function renderTextWithLineBreaks(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    nodes.push(line);
    if (index < lines.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
  });
  return nodes;
}

function renderInlineMarkdown(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const token = match[0];
    if (!token) continue;
    const start = match.index ?? 0;
    const plainText = value.slice(cursor, start);
    if (plainText) {
      nodes.push(...renderTextWithLineBreaks(plainText, `plain-${tokenIndex}`));
      tokenIndex += 1;
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`strong-${tokenIndex}`} className="font-semibold text-slate-800">
          {token.slice(2, -2)}
        </strong>,
      );
      tokenIndex += 1;
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`code-${tokenIndex}`}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
      tokenIndex += 1;
    } else {
      const linkMatch = token.match(LINK_MARKDOWN_PATTERN);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const isAnchor = href.startsWith("#");
        nodes.push(
          <a
            key={`link-${tokenIndex}`}
            href={href}
            target={isAnchor ? undefined : "_blank"}
            rel={isAnchor ? undefined : "noopener noreferrer"}
            className="underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-800 hover:decoration-slate-500"
          >
            {label}
          </a>,
        );
        tokenIndex += 1;
      } else {
        nodes.push(...renderTextWithLineBreaks(token, `token-${tokenIndex}`));
        tokenIndex += 1;
      }
    }

    cursor = start + token.length;
  }

  const trailingText = value.slice(cursor);
  if (trailingText) {
    nodes.push(...renderTextWithLineBreaks(trailingText, `trail-${tokenIndex}`));
  }

  return nodes;
}

function parseMarkdownBlocks(value: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let cursor = 0;

  const pushParagraphBlocks = (text: string) => {
    text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .forEach((paragraph) => {
        blocks.push({ type: "paragraph", value: paragraph });
      });
  };

  for (const match of value.matchAll(FENCED_CODE_BLOCK_PATTERN)) {
    const fullMatch = match[0];
    if (!fullMatch) continue;
    const start = match.index ?? 0;
    pushParagraphBlocks(value.slice(cursor, start));
    blocks.push({
      type: "code",
      language: safeString(match[1]),
      value: safeString(match[2]).replace(/\n$/, ""),
    });
    cursor = start + fullMatch.length;
  }

  pushParagraphBlocks(value.slice(cursor));
  return blocks;
}

function MarkdownContent({
  content,
  className,
  paragraphClassName,
  codeClassName,
}: {
  content: string;
  className?: string;
  paragraphClassName: string;
  codeClassName?: string;
}) {
  const normalized = safeString(content).trim();
  if (!normalized) return null;

  const blocks = parseMarkdownBlocks(normalized);
  if (blocks.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <pre
            key={index}
            data-language={block.language || undefined}
            className={cn(
              "max-w-prose overflow-x-auto rounded-lg bg-slate-900/95 px-4 py-3 text-[13px] leading-relaxed text-slate-100",
              codeClassName,
            )}
          >
            <code>{block.value}</code>
          </pre>
        ) : (
          <p key={index} className={paragraphClassName}>
            {renderInlineMarkdown(block.value)}
          </p>
        ),
      )}
    </div>
  );
}

function MarkdownInline({ content }: { content: string }) {
  const text = safeString(content);
  if (!text) return null;
  return <>{renderInlineMarkdown(text)}</>;
}

// ---------------------------------------------------------------------------
// Link list (shared across blocks)
// ---------------------------------------------------------------------------

function BlockLinks({ links }: { links?: BlockLink[] }) {
  const safeLinks = safeArray<BlockLink>(links).filter(
    (l) => typeof l === "object" && l !== null && safeString(l.href),
  );
  if (safeLinks.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
      {safeLinks.map((link, i) => {
        const href = safeString(link.href);
        const text = safeString(link.anchor || link.label) || href;
        return (
          <li key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] text-slate-500 transition-colors hover:text-slate-800"
            >
              <ExternalLink className="h-3 w-3" />
              {text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function HeroBlockView({
  block,
  skipHeading,
}: {
  block: DocumentBlock;
  skipHeading: boolean;
}) {
  const heading = safeString(block.heading);
  const body = safeString(block.body);
  if (!heading && !body) return null;

  return (
    <header className="rounded-2xl border border-slate-100 bg-slate-50/70 px-7 py-7 md:px-9 md:py-9">
      {heading && !skipHeading ? (
        <h2 className="font-display text-xl font-bold leading-snug text-slate-800 md:text-2xl">
          {heading}
        </h2>
      ) : null}
      {body ? (
        <MarkdownContent
          content={body}
          className={cn(heading && !skipHeading && "mt-3")}
          paragraphClassName="max-w-prose text-[15px] leading-[1.75] text-slate-600"
        />
      ) : null}
      <BlockLinks links={block.links} />
    </header>
  );
}

function SummaryBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const body = safeString(block.body);

  return (
    <section className="rounded-xl border border-slate-200/80 border-l-[3px] border-l-slate-400 bg-slate-50/60 px-6 py-5">
      {heading ? (
        <h2 className="text-[15px] font-semibold uppercase tracking-wide text-slate-500">
          {heading}
        </h2>
      ) : null}
      {body ? (
        <MarkdownContent
          content={body}
          className={cn(heading && "mt-2")}
          paragraphClassName="max-w-prose text-[15px] leading-[1.75] text-slate-700"
        />
      ) : null}
      <BlockLinks links={block.links} />
    </section>
  );
}

function SectionBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const body = safeString(block.body);
  const Tag = headingTag(block.level);

  return (
    <section>
      {heading ? <Tag className={headingStyles[Tag]}>{heading}</Tag> : null}
      {body ? (
        <MarkdownContent
          content={body}
          className={cn(heading && "mt-3")}
          paragraphClassName="max-w-prose text-[15px] leading-[1.8] text-slate-600"
        />
      ) : null}
      <BlockLinks links={block.links} />
    </section>
  );
}

function ListBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const items = safeArray<string>(block.items);
  const isOrdered = block.ordered === true;

  return (
    <section>
      {heading ? <h2 className={headingStyles.h2}>{heading}</h2> : null}
      {isOrdered ? (
        <ol className={cn("space-y-2.5 pl-5", heading ? "mt-4" : "mt-1")}>
          {items.map((item, i) => (
            <li
              key={i}
              className="list-decimal pl-1 text-[15px] leading-[1.7] text-slate-600 marker:font-semibold marker:text-slate-400"
            >
              <MarkdownInline content={safeString(item)} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className={cn("space-y-2.5", heading ? "mt-4" : "mt-1")}>
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.7] text-slate-600">
              <span className="mt-[9px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-slate-300" />
              <span>
                <MarkdownInline content={safeString(item)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <BlockLinks links={block.links} />
    </section>
  );
}

function StepsBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const items = safeArray<string>(block.items);

  return (
    <section>
      {heading ? <h2 className={headingStyles.h2}>{heading}</h2> : null}
      <ol className={cn("space-y-4", heading ? "mt-4" : "mt-1")}>
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-4">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
              {i + 1}
            </span>
            <span className="pt-0.5 text-[15px] leading-[1.7] text-slate-600">
              <MarkdownInline content={safeString(item)} />
            </span>
          </li>
        ))}
      </ol>
      <BlockLinks links={block.links} />
    </section>
  );
}

function ComparisonTableBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const columns = safeArray<string>(block.table_columns);
  const rows = safeArray<string[]>(block.table_rows);

  if (columns.length === 0) return null;

  return (
    <section>
      {heading ? <h2 className={headingStyles.h2}>{heading}</h2> : null}
      <div className={cn("overflow-x-auto rounded-xl border border-slate-200/80", heading ? "mt-4" : "mt-1")}>
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/80">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {safeString(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const cells = Array.isArray(row) ? row : [];
              return (
                <tr
                  key={ri}
                  className="border-b border-slate-100 last:border-b-0 even:bg-slate-50/40"
                >
                  {cells.map((cell, ci) => (
                    <td key={ci} className="px-5 py-3.5 text-slate-600">
                      <MarkdownInline content={safeString(cell)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BlockLinks links={block.links} />
    </section>
  );
}

function FaqBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const faqItems = safeArray<{ question?: string; answer?: string }>(block.faq_items).filter(
    (item) => typeof item === "object" && item !== null && safeString(item.question),
  );

  if (faqItems.length === 0) return null;

  return (
    <section>
      {heading ? <h2 className={headingStyles.h2}>{heading}</h2> : null}
      <div className={cn("space-y-2", heading ? "mt-4" : "mt-1")}>
        {faqItems.map((item, i) => (
          <details key={i} className="group rounded-xl border border-slate-200/80 bg-white">
            <summary className="cursor-pointer select-none list-none px-5 py-3.5 text-[15px] font-medium text-slate-700 marker:content-[''] transition-colors hover:text-slate-900">
              <span className="flex items-center justify-between gap-3">
                <span>
                  <MarkdownInline content={safeString(item.question)} />
                </span>
                <span className="flex-shrink-0 text-slate-300 transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <div className="border-t border-slate-100 px-5 py-4">
              <MarkdownContent
                content={safeString(item.answer)}
                paragraphClassName="text-[14px] leading-[1.75] text-slate-600"
                codeClassName="text-[12px]"
              />
            </div>
          </details>
        ))}
      </div>
      <BlockLinks links={block.links} />
    </section>
  );
}

function CtaBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const body = safeString(block.body);
  const cta = typeof block.cta === "object" && block.cta !== null ? block.cta : {};
  const ctaLabel = safeString(cta.label) || "Learn more";
  const ctaHref = safeString(cta.href) || "#";

  return (
    <aside className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 px-8 py-9 text-center md:px-12">
      {heading ? (
        <h2 className="font-display text-lg font-bold text-white md:text-xl">{heading}</h2>
      ) : null}
      {body ? (
        <MarkdownContent
          content={body}
          className={cn(heading && "mt-3")}
          paragraphClassName="mx-auto max-w-2xl text-[14px] leading-[1.7] text-blue-50"
          codeClassName="mx-auto max-w-2xl bg-blue-950"
        />
      ) : null}
      <a
        href={ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-blue-600 shadow-sm transition-all hover:bg-blue-50 hover:shadow-md",
          heading || body ? "mt-5" : "",
        )}
      >
        {ctaLabel}
      </a>
    </aside>
  );
}

function ConclusionBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const body = safeString(block.body);

  return (
    <footer className="rounded-xl border border-slate-200/80 border-l-[3px] border-l-emerald-400/70 bg-emerald-50/30 px-6 py-5">
      {heading ? (
        <h2 className="text-[15px] font-semibold text-slate-800">{heading}</h2>
      ) : null}
      {body ? (
        <MarkdownContent
          content={body}
          className={cn(heading && "mt-2")}
          paragraphClassName="max-w-prose text-[15px] leading-[1.75] text-slate-600"
        />
      ) : null}
      <BlockLinks links={block.links} />
    </footer>
  );
}

function SourcesBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading) || "Sources";
  const body = safeString(block.body);
  const links = safeArray<BlockLink>(block.links).filter(
    (l) => typeof l === "object" && l !== null && safeString(l.href),
  );

  return (
    <section className="rounded-xl border border-slate-200/60 bg-slate-50/40 px-6 py-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{heading}</h3>
      {body ? (
        <MarkdownContent
          content={body}
          className="mt-1.5"
          paragraphClassName="text-sm leading-relaxed text-slate-500"
        />
      ) : null}
      {links.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {links.map((link, i) => {
            const href = safeString(link.href);
            const text = safeString(link.anchor || link.label) || href;
            return (
              <li key={i}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition-colors hover:text-slate-700"
                >
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  {text}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function FallbackBlockView({ block }: { block: DocumentBlock }) {
  const heading = safeString(block.heading);
  const body = safeString(block.body);
  if (!heading && !body) return null;

  return (
    <section>
      {heading ? <h2 className={headingStyles.h2}>{heading}</h2> : null}
      {body ? (
        <MarkdownContent
          content={body}
          className={cn(heading && "mt-3")}
          paragraphClassName="max-w-prose text-[15px] leading-[1.8] text-slate-600"
        />
      ) : null}
      <BlockLinks links={block.links} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Block dispatcher
// ---------------------------------------------------------------------------

function ArticleBlock({
  block,
  isFirstBlock,
  articleHasH1,
}: {
  block: DocumentBlock;
  isFirstBlock: boolean;
  articleHasH1: boolean;
}) {
  const blockType = safeString(block.block_type);

  switch (blockType) {
    case "hero":
      // Skip the hero heading if we already rendered the seo_meta h1 and
      // the hero heading is the same text (avoids visual duplication).
      return <HeroBlockView block={block} skipHeading={articleHasH1} />;
    case "summary":
      return <SummaryBlockView block={block} />;
    case "section":
      return <SectionBlockView block={block} />;
    case "list":
      return <ListBlockView block={block} />;
    case "steps":
      return <StepsBlockView block={block} />;
    case "comparison_table":
      return <ComparisonTableBlockView block={block} />;
    case "faq":
      return <FaqBlockView block={block} />;
    case "cta":
      return <CtaBlockView block={block} />;
    case "conclusion":
      return <ConclusionBlockView block={block} />;
    case "sources":
      return <SourcesBlockView block={block} />;
    default:
      return <FallbackBlockView block={block} />;
  }
}

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

export function ArticleViewer({ document }: { document: Record<string, unknown> }) {
  const { seo_meta, author, featured_image, blocks } = parseDocument(document);
  const safeBlocks = safeArray<DocumentBlock>(blocks);
  const h1Text = safeString(seo_meta?.h1);
  const featuredImageUrl = safeString(featured_image?.signed_url);
  const featuredImageTitle = safeString(featured_image?.title_text);
  const authorName = safeString(author?.name);
  const authorBio = safeString(author?.bio);
  const authorTitle = safeString(author?.basic_info?.title);
  const authorLocation = safeString(author?.basic_info?.location);
  const authorProfileImage = safeString(author?.profile_image?.signed_url);

  return (
    <article className="mx-auto max-w-[56rem] space-y-8 py-1 sm:py-2 lg:space-y-9">
      {h1Text ? (
        <h1 className="font-display text-[2rem] font-bold leading-tight tracking-tight text-slate-900 lg:text-[2.35rem]">
          {h1Text}
        </h1>
      ) : null}

      {/* Author byline */}
      {authorName ? (
        <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
          {authorProfileImage ? (
            <img
              src={authorProfileImage}
              alt={authorName}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <User className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-slate-900">{authorName}</span>
              {authorTitle ? (
                <span className="text-sm text-slate-500">· {authorTitle}</span>
              ) : null}
              {authorLocation ? (
                <span className="text-sm text-slate-500">· {authorLocation}</span>
              ) : null}
            </div>
            {authorBio ? (
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{authorBio}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Featured image */}
      {featuredImageUrl ? (
        <div className="overflow-hidden rounded-2xl">
          <img
            src={featuredImageUrl}
            alt={featuredImageTitle || h1Text || "Article featured image"}
            className="w-full object-cover"
            style={{
              aspectRatio: featured_image?.width && featured_image?.height
                ? `${featured_image.width} / ${featured_image.height}`
                : "16 / 9"
            }}
          />
        </div>
      ) : null}

      {safeBlocks.map((block, index) => (
        <ArticleBlock
          key={index}
          block={block}
          isFirstBlock={index === 0}
          articleHasH1={!!h1Text}
        />
      ))}
    </article>
  );
}

export function ArticleLoadingState() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <Skeleton className="h-9 w-3/4" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="h-2" />
      <Skeleton className="h-7 w-1/2" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[88%]" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="h-2" />
      <Skeleton className="h-7 w-2/5" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function ArticleEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 px-6 py-14">
      <FileX className="h-10 w-10 text-slate-300" />
      <p className="mt-4 font-semibold text-slate-600">No article generated</p>
      <p className="mt-1 text-sm text-slate-400">
        The pipeline completed without generating an article for this brief.
      </p>
    </div>
  );
}
