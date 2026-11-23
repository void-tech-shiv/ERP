import { load } from 'cheerio';

/** Only aggregated, non-secret signals may be returned to the test UI. */
export function cookieTransition(
  before: Record<string, string>,
  after: Record<string, string>,
): { before: number; after: number; changed: boolean } {
  const beforeKeys=Object.keys(before);
  const afterKeys=Object.keys(after);
  return {
    before: beforeKeys.length,
    after: afterKeys.length,
    changed: beforeKeys.length !== afterKeys.length ||
      afterKeys.some(key => before[key] !== after[key]),
  };
}

export function attendanceFormDetected(html: string): boolean {
  if (html.length > 1_000_000) return false;
  const $=load(html);
  return Boolean(
    $('select[name="DynamicModel[academicyear]"]').length &&
    $('select[name="DynamicModel[semesterid]"]').length &&
    ($('input[name="_csrf"]').length || $('meta[name="csrf-token"]').length)
  );
}
