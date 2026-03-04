import { Button } from "~/components/ui/button";
import type { ExpandedAsset } from "./types";

export function ExpandedAssetPreviewModal({
  expandedAsset,
  onClose,
}: {
  expandedAsset: ExpandedAsset | null;
  onClose: () => void;
}) {
  if (!expandedAsset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
      <button type="button" className="absolute inset-0" aria-label="Close image preview" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">{expandedAsset.role}</p>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <img src={expandedAsset.url} alt={expandedAsset.role} className="max-h-[75vh] w-full rounded-lg border border-slate-200 object-contain" />
        <a
          href={expandedAsset.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-xs font-semibold text-[#1e5052] hover:underline"
        >
          Open source URL
        </a>
      </div>
    </div>
  );
}

