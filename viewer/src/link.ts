/** Tokens are 18 random bytes in base64url: exactly 24 characters (CLAUDE.md hard rules). */
const VIEWER_PATH = /^\/d\/([A-Za-z0-9_-]{24})\/?$/;

/** The link token from a viewer path such as /d/AbCd.../, or null when the path is not a viewer link. */
export function tokenFromPath(pathname: string): string | null {
  return VIEWER_PATH.exec(pathname)?.[1] ?? null;
}

/** What the backend says about a link (GET /d/{token}/info, docs/v2-contract.md). */
export interface LinkInfo {
  name: string;
  pageCount: number | null;
  sizeBytes: number;
  allowDownload: boolean;
}

export function isLinkInfo(value: unknown): value is LinkInfo {
  if (typeof value !== 'object' || value === null) return false;
  const info = value as Record<string, unknown>;
  return (
    typeof info.name === 'string' &&
    (info.pageCount === null || typeof info.pageCount === 'number') &&
    typeof info.sizeBytes === 'number' &&
    typeof info.allowDownload === 'boolean'
  );
}

/** "180 KB", "2.4 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
