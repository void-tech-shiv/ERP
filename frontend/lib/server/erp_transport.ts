/** Extra time only if the caller has validated the official ERP login POST.
 * No automatic retries. The predicate lives in erp_pjax.ts.
 */
export function erpRequestTimeoutMs(officialLoginPost: boolean): number {
  return officialLoginPost ? 30_000 : 12_000;
}

/** Never surface the raw thrown exception: it can contain upstream details. */
export function classifyERPTransportError(error: unknown): 'timeout' | 'upstream-error' {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return 'timeout';
  return 'upstream-error';
}
