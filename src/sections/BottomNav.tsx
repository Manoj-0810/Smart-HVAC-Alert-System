import type { ViewState } from '@/types/hvac';
import { LayoutDashboard, Bell, Settings } from 'lucide-react';

interface BottomNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  alertCount: number;
}

export function BottomNav({ currentView, onNavigate, alertCount }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
        onClick={() => onNavigate('dashboard')}
      >
        <LayoutDashboard className="nav-icon" />
        <span className="nav-label">Dashboard</span>
      </button>

      <button
        className={`nav-item ${currentView === 'alerts' ? 'active' : ''}`}
        onClick={() => onNavigate('alerts')}
      >
        <Bell className="nav-icon" />
        <span className="nav-label">Alerts</span>
        {alertCount > 0 && <span className="nav-badge">{alertCount > 99 ? '99+' : alertCount}</span>}
      </button>

      <button
        className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <Settings className="nav-icon" />
        <span className="nav-label">Settings</span>
      </button>
    </nav>
  );
}
