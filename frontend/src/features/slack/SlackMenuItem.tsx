import { useEffect, useState } from 'react';
import { Hash } from 'lucide-react';
import { api, slackConnectUrl } from '../../api/client';
import { MenuItem } from '../../components/ui/Menu';
import { useToast } from '../../components/ui/Toast';
import type { SlackStatus } from '../../types';

/** Connect / disconnect Slack from the user menu. */
export function SlackMenuItem({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<SlackStatus | null>(null);

  useEffect(() => {
    api.slack().then(setStatus).catch(() => setStatus({ connected: false, teamName: null, channel: null }));
  }, []);

  if (!status) return null;

  if (!status.connected)
    return (
      <MenuItem onClick={() => (window.location.href = slackConnectUrl)}>
        <Hash size={15} /> Connect Slack
      </MenuItem>
    );

  return (
    <MenuItem
      onClick={async () => {
        try {
          await api.disconnectSlack();
          setStatus({ connected: false, teamName: null, channel: null });
          toast('info', 'Slack disconnected');
        } catch (e) {
          toast('error', (e as Error).message);
        }
        onDone();
      }}
    >
      <Hash size={15} className="text-brand-600" /> Disconnect Slack{status.channel ? ` (${status.channel})` : ''}
    </MenuItem>
  );
}
