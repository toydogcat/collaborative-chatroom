import { useState, useEffect } from 'react';
import { ExternalLink, Globe } from 'lucide-react';

interface LinkPreviewProps {
  url: string;
}

interface PreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  favicon: string;
  siteName: string;
}

// In-memory cache to prevent redundant fetches within the same session
const previewCache: Record<string, PreviewData> = {};

export default function LinkPreview({ url }: LinkPreviewProps) {
  const [data, setData] = useState<PreviewData | null>(previewCache[url] || null);
  const [loading, setLoading] = useState(!previewCache[url]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (previewCache[url]) {
      setData(previewCache[url]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch link preview');
        return res.json();
      })
      .then((meta) => {
        if (isMounted) {
          previewCache[url] = meta;
          setData(meta);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[LinkPreview fetch error]', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 animate-pulse flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-slate-800 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-slate-800 rounded w-1/3" />
          <div className="h-2.5 bg-slate-800 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    // Clean fallback link card
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 flex items-center justify-between gap-3 p-3 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl group transition-all text-left"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Globe className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-300 font-medium truncate">{url}</span>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 transition-colors" />
      </a>
    );
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2.5 block overflow-hidden rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 transition-all text-left group"
    >
      {data.image && (
        <div className="w-full h-24 relative overflow-hidden border-b border-slate-850 bg-slate-900">
          <img
            src={data.image}
            alt={data.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1 text-[9px] text-indigo-400 font-bold tracking-wider uppercase">
          {data.favicon ? (
            <img 
              src={data.favicon} 
              className="w-3 h-3 rounded-full object-contain shrink-0" 
              referrerPolicy="no-referrer" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
            />
          ) : (
            <Globe className="w-3 h-3 text-indigo-400" />
          )}
          <span className="truncate">{data.siteName}</span>
        </div>
        <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 line-clamp-1 transition-colors leading-normal">
          {data.title}
        </h4>
        <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
          {data.description}
        </p>
      </div>
    </a>
  );
}
