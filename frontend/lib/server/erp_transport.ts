import { usesPjaxLogin } from './erp_pjax';

/** Extra time only for the official ERP login POST. No automatic retries. */
export function erpRequestTimeoutMs(method: string, target: string): number {
  return usesPjaxLogin(method, target) ? 30_000 : 12_000;
}

/** Never surface the raw thrown exception: it can contain upstream details. */
export function classifyERPTransportError(error: unknown): 'timeout' | 'upstream-error' {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return 'timeout';
  return 'upstream-error';
}
