'use client';

import { useEffect, useState } from 'react';
import { generatePresignedUrl } from '@/lib/presignUrl';
import { logger } from '@/lib/logger';

interface AdminDocumentViewerProps {
  documentId: string;
}

export default function AdminDocumentViewer({ documentId }: AdminDocumentViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const parts = documentId.split('/');
        const bucket = parts[0];
        const path = parts.slice(1).join('/');
        const signedUrl = await generatePresignedUrl(bucket, path, 300);
        if (cancelled) return;

        if (signedUrl) {
          setUrl(signedUrl);
        } else {
          setError('Failed to generate document URL');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          logger.error('[AdminDocumentViewer] error', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-xl">
        <p className="text-gray-500 font-Jakarta">Loading document...</p>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 rounded-xl border border-red-200">
        <p className="text-red-600 font-Jakarta text-sm">{error ?? 'Document unavailable'}</p>
      </div>
    );
  }

  const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(url);
  const isPdf = /\.pdf$/i.test(url);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      {isImage ? (
        <img src={url} alt="Document" className="w-full h-auto max-h-96 object-contain bg-gray-50" />
      ) : isPdf ? (
        <iframe src={url} className="w-full h-96" title="Document" />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 text-center text-goBlue font-Jakarta underline"
        >
          Open Document
        </a>
      )}
    </div>
  );
}
