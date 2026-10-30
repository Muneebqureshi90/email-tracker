/** "180 KB", "2.4 MB" (the same rule as the document viewer). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The link text "Insert tracked file" puts into the email, e.g. "Resume.pdf · PDF · 180 KB". */
export function documentLinkText(name: string, sizeBytes: number): string {
  return `${name} · PDF · ${formatSize(sizeBytes)}`;
}
