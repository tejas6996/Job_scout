// Mirrors "Verify Apply Link" -> "Mark Verified": HEAD/GET the apply link,
// follow redirects, and treat any 2xx/3xx as reachable. Network errors are
// swallowed (matches the workflow's onError: continueRegularOutput) and just
// count as unverified rather than failing the whole run.
export async function verifyApplyLink(job, timeout = 8000) {
  if (!job.apply_link) return { ...job, verified: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(job.apply_link, { redirect: 'follow', signal: controller.signal });
    return { ...job, verified: res.status >= 200 && res.status < 400 };
  } catch {
    return { ...job, verified: false };
  } finally {
    clearTimeout(timer);
  }
}
