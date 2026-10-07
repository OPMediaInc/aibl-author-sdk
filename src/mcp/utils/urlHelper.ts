export function buildFullUrl(baseUrl?: string | null, relativePath?: string | null): string | null {
  if (!baseUrl || !relativePath) {
    return null;
  }
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${cleanBase}${cleanPath}`;
}

export function enrichWithUrls<T>(target: T, baseUrl?: string | null): T {
  if (!baseUrl || !target || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((item) => enrichWithUrls(item, baseUrl)) as unknown as T;
  }

  const obj = target as any;
  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      result[key] = enrichWithUrls(value, baseUrl);
    } else {
      result[key] = value;
    }
  }

  // 1. If explicit paths exist, inject full URLs
  if (result.webPath && !result.viewUrl) {
    result.viewUrl = buildFullUrl(baseUrl, result.webPath);
  }
  if (result.dashboardPath && !result.manageUrl) {
    result.manageUrl = buildFullUrl(baseUrl, result.dashboardPath);
  }

  // 2. Synthesize fallbacks if paths were omitted:
  // Post fallback
  if (!result.viewUrl && (result.orgSlug || result.organization?.slug) && (result.siteSlug || result.site?.slug) && result.slug && (result.hasPublishedVersion || result.publishedVersionId)) {
    const org = result.orgSlug || result.organization?.slug;
    const site = result.siteSlug || result.site?.slug;
    result.viewUrl = buildFullUrl(baseUrl, `/orgs/${org}/cores/${site}/posts/${result.slug}`);
  }
  if (!result.manageUrl && (result.orgSlug || result.organization?.slug) && (result.siteSlug || result.site?.slug) && (result.slug || result.hasPublishedVersion !== undefined || result.publishedVersionId !== undefined || result.postId) && (result.id || result.postId)) {
    const org = result.orgSlug || result.organization?.slug;
    const site = result.siteSlug || result.site?.slug;
    const id = result.id || result.postId;
    result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${org}/cores/${site}/posts/${id}`);
  }

  // Core (Site) fallback
  if (!result.viewUrl && (result.organizationSlug || result.orgSlug) && result.slug && (result.accessMode !== undefined || result.organizationId !== undefined)) {
    const org = result.organizationSlug || result.orgSlug;
    result.viewUrl = buildFullUrl(baseUrl, `/orgs/${org}/cores/${result.slug}`);
  }
  if (!result.manageUrl && (result.organizationSlug || result.orgSlug) && result.slug && (result.accessMode !== undefined || result.organizationId !== undefined)) {
    const org = result.organizationSlug || result.orgSlug;
    result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${org}/cores/${result.slug}`);
  }

  // Organization fallback
  if (!result.viewUrl && result.slug && (result.memberCount !== undefined || result.siteCount !== undefined)) {
    result.viewUrl = buildFullUrl(baseUrl, `/orgs/${result.slug}`);
  }
  if (!result.manageUrl && result.slug && (result.memberCount !== undefined || result.siteCount !== undefined)) {
    result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${result.slug}`);
  }

  // Expert (Agent) fallback
  if (!result.manageUrl && result.id && (result.orgSlug || result.organizationSlug || result.organizationId) && (result.siteSlug !== undefined || result.siteId !== undefined)) {
    const org = result.orgSlug || result.organizationSlug;
    if (org) {
      result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${org}/experts/${result.id}`);
    }
  }

  return result as T;
}
