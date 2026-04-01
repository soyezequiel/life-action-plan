import { DateTime } from 'luxon';

export interface CodexUsageData {
  limit: number;
  remaining: number;
  reset?: string;
}

export interface QuotaInfo {
  remainingRequests?: number;
  remainingTokens?: number;
  resetRequests?: string;
  resetTokens?: string;
  codexUsage?: Record<string, CodexUsageData>;
}

export function extractQuotaInfo(headers: Record<string, string> | Headers | undefined): QuotaInfo | null {
  if (!headers) return null;

  const h: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      h[key.toLowerCase()] = value;
    });
  } else {
    Object.entries(headers).forEach(([k, v]) => {
      h[k.toLowerCase()] = v;
    });
  }

  const info: QuotaInfo = {};

  // OpenAI Style
  if (h['x-ratelimit-remaining-requests']) {
    info.remainingRequests = parseInt(h['x-ratelimit-remaining-requests'], 10);
  }
  if (h['x-ratelimit-remaining-tokens']) {
    info.remainingTokens = parseInt(h['x-ratelimit-remaining-tokens'], 10);
  }
  if (h['x-ratelimit-reset-requests']) {
    info.resetRequests = h['x-ratelimit-reset-requests'];
  }
  if (h['x-ratelimit-reset-tokens']) {
    info.resetTokens = h['x-ratelimit-reset-tokens'];
  }

  // OpenRouter / Generic Style
  if (info.remainingRequests === undefined && h['x-ratelimit-remaining']) {
    info.remainingRequests = parseInt(h['x-ratelimit-remaining'], 10);
  }
  if (info.resetRequests === undefined && h['x-ratelimit-reset']) {
    info.resetRequests = h['x-ratelimit-reset'];
  }

  return Object.keys(info).length > 0 ? info : null;
}

export function formatQuotaMessage(info: QuotaInfo | null | undefined): string | null {
  if (!info) return null;

  if (info.codexUsage) {
    const codexParts: string[] = [];
    const keys = ['codex_5h', 'codex_7d'];
    
    for (const key of keys) {
      const data = info.codexUsage[key];
      const label = key.replace('codex_', '');
      
      if (!data || data.limit === 0) {
        codexParts.push(`Uso Codex ${label}: no expuesto por el backend para esta cuenta`);
        continue;
      }

      const usedPct = Math.round(((data.limit - data.remaining) / data.limit) * 100);
      const availPct = 100 - usedPct;
      let resetStr = '';
      
      if (data.reset) {
        const dt = DateTime.fromISO(data.reset).setZone('utc');
        if (dt.isValid) {
          resetStr = ` | reinicia ${dt.toFormat('yyyy-MM-dd HH:mm')}`;
        }
      }

      codexParts.push(`Uso Codex ${label}: ${usedPct}% usado | ${availPct}% disponible${resetStr}`);
    }

    return codexParts.join(', ');
  }

  const parts: string[] = [];

  if (info.remainingRequests !== undefined) {
    parts.push(`${info.remainingRequests} req`);
  }
  
  if (info.remainingTokens !== undefined) {
    parts.push(`${info.remainingTokens} tokens`);
  }

  const reset = info.resetTokens || info.resetRequests;
  if (reset) {
    parts.push(`reinicia en ${reset}`);
  }

  if (parts.length === 0) return null;

  return `Limite actual: ${parts.join(', ')}.`;
}

export function extractQuotaFromError(error: any): QuotaInfo | null {
  if (!error) return null;

  let info: QuotaInfo | null = null;

  // AI SDK APICallError has responseHeaders
  if (error.responseHeaders) {
    info = extractQuotaInfo(error.responseHeaders);
  }

  // AI SDK RetryError has lastError
  if (!info && error.lastError && error.lastError.responseHeaders) {
    info = extractQuotaInfo(error.lastError.responseHeaders);
  }

  // Try to parse JSON body for Codex usage
  const body = error.responseBody || error.responseText || (error.lastError?.responseBody) || (error.lastError?.responseText);
  if (body && typeof body === 'string' && body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body);
      const usageData = parsed.detail?.usage_data || parsed.usage_data;
      if (usageData && typeof usageData === 'object') {
        info = info || {};
        info.codexUsage = usageData as Record<string, CodexUsageData>;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return info;
}
