import type { ViewState } from '@/types/hvac';
import { ArrowLeft, Bell, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface StatusBarProps {
  view: ViewState;
  currentTime: Date;
  activeAlertCount: number;
  onBack: () => void;
  onAlertsClick: () => void;
}

export function StatusBar({ view, currentTime, activeAlertCount, onBack, onAlertsClick }: StatusBarProps) {
  const showBack = view !== 'dashboard';

  const titles: Record<ViewState, string> = {
    dashboard: 'HVAC Sentinel',
    'unit-detail': 'Unit Details',
    alerts: 'Active Alerts',
    settings: 'Settings',
  };

  return (
    <header className="status-bar">
      <div className="status-left">
        {showBack && (
          <button className="back-btn" onClick={onBack} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
        )}
        <span className="status-title">{titles[view]}</span>
      </div>

      <div className="status-right">
        <div className="time-display">
          <Clock size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          {format(currentTime, 'h:mm a')}
        </div>
        <button className="alert-badge" onClick={onAlertsClick} aria-label="View alerts">
          <Bell size={20} />
          {activeAlertCount > 0 && (
            <span className="badge-count">{activeAlertCount > 99 ? '99+' : activeAlertCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}
