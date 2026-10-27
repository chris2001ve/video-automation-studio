import { AlertTriangle } from 'lucide-react';
import type { ServiceIssue } from '../../core/types';
import type { T } from '../i18n';

export function ServiceBanner({ t, issue, label }: { t: T; issue: ServiceIssue; label: string }) {
  const min = Math.max(1, Math.round((Date.now() - issue.since) / 60000));
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/60 bg-gradient-to-r from-amber-700/40 to-amber-600/20 px-4 py-2.5 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div>
        <span className="font-semibold text-amber-100">{t('serviceTrouble', { p: label })}</span>
        <span className="ml-2 text-amber-100/80">{t('serviceTroubleBody', { p: label, m: issue.message.slice(0, 80), n: issue.count, min })}</span>
      </div>
    </div>
  );
}
