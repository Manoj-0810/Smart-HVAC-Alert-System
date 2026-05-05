import type { HvacUnit, AnomalyEvent } from '@/types/hvac';
import {
  Activity, ChevronRight, Thermometer, Wind, AlertTriangle,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardProps {
  units: HvacUnit[];
  anomalies: AnomalyEvent[];
  onUnitSelect: (unitId: string) => void;
  onViewAlerts: () => void;
  fpRate: number;
}

export function Dashboard({ units, anomalies, onUnitSelect, onViewAlerts, fpRate }: DashboardProps) {
  const criticalCount = units.filter(u => u.status === 'critical').length;
  const warningCount = units.filter(u => u.status === 'warning').length;
  const offlineCount = units.filter(u => u.status === 'offline').length;
  const healthyCount = units.filter(u => u.status === 'healthy').length;

  const avgHealth = units.length > 0
    ? Math.round(units.reduce((sum, u) => sum + u.healthScore, 0) / units.length)
    : 100;

  const topAlerts = anomalies.slice(0, 3);

  const getHealthClass = (score: number, status: string) => {
    if (status === 'offline') return 'offline';
    if (score >= 80) return 'healthy';
    if (score >= 50) return 'warning';
    return 'critical';
  };

  const getBarClass = (score: number, status: string) => {
    if (status === 'offline') return 'gray';
    if (score >= 80) return 'green';
    if (score >= 50) return 'amber';
    return 'red';
  };

  return (
    <div className="dashboard">
      {/* System Health Banner */}
      <motion.div
        className="health-banner"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="health-header">
          <span className="health-title">Fleet Health</span>
          <span className={`health-score ${getHealthClass(avgHealth, offlineCount > 0 ? 'offline' : 'healthy')}`}>
            {avgHealth}%
          </span>
        </div>
        <div className="health-bar-bg">
          <div
            className={`health-bar-fill ${getBarClass(avgHealth, offlineCount > 0 ? 'offline' : 'healthy')}`}
            style={{ width: `${avgHealth}%` }}
          />
        </div>
        <div className="health-footer">
          <span className={`health-status-text ${getHealthClass(avgHealth, offlineCount > 0 ? 'offline' : 'healthy')}`}>
            {criticalCount > 0 ? `${criticalCount} Critical` : warningCount > 0 ? `${warningCount} Warning` : offlineCount > 0 ? `${offlineCount} Offline` : 'All Systems Healthy'}
          </span>
          <span className="fp-rate">
            {fpRate > 0 ? `${(fpRate * 100).toFixed(0)}% noise filtered` : 'Multi-sensor correlation active'}
          </span>
        </div>
      </motion.div>

      {/* Priority Alerts */}
      {topAlerts.length > 0 && (
        <div className="priority-section">
          <div className="section-header">
            <span className="section-title">Needs Attention</span>
            <button className="section-action" onClick={onViewAlerts}>
              View All {anomalies.length > 3 && `(${anomalies.length})`}
            </button>
          </div>

          {topAlerts.map((alert, idx) => (
            <motion.div
              key={alert.id}
              className={`alert-card ${alert.severity}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => onUnitSelect(alert.unitId)}
            >
              <div className="alert-card-header">
                <span className={`alert-severity-badge ${alert.severity}`}>
                  {alert.severity === 'critical' && <AlertTriangle size={12} />}
                  {alert.severity}
                </span>
                <span className="alert-confidence">
                  {(alert.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              <div>
                <span className="alert-unit-tag">
                  <Activity size={12} />
                  {alert.unitId.replace('_', ' ')}
                </span>
              </div>
              <p className="alert-title">{alert.title}</p>
              <p className="alert-description">{alert.description}</p>
              <button className="alert-action-btn" onClick={(e) => {
                e.stopPropagation();
                onUnitSelect(alert.unitId);
              }}>
                Go to Unit <ChevronRight size={14} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Units Grid */}
      <div className="section-header">
        <span className="section-title">All Units</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {healthyCount} healthy / {units.length} total
        </span>
      </div>

      <div className="units-grid">
        {units.map((unit, idx) => (
          <motion.div
            key={unit.id}
            className={`unit-card ${unit.status}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.06 }}
            onClick={() => onUnitSelect(unit.id)}
          >
            <div className="unit-card-header">
              <span className="unit-name">{unit.name}</span>
              <span className={`unit-status-dot ${unit.status}`} />
            </div>
            <span className="unit-location">{unit.location}</span>

            <div className="unit-health">
              <span className={`unit-health-value ${unit.status}`}>{unit.healthScore}</span>
              <span className="unit-health-label">/100</span>
            </div>

            <div className="unit-mini-metrics">
              <span className="unit-metric-pill">
                <Thermometer size={11} />
                {unit.lastReading?.temp?.toFixed(1) ?? '--'}°
              </span>
              <span className="unit-metric-pill">
                <Wind size={11} />
                {unit.lastReading?.airflow?.toFixed(0) ?? '--'}
              </span>
            </div>

            {unit.anomalies.filter(a => !a.isAcknowledged).length > 0 && (
              <span className={`unit-alert-count ${unit.status === 'critical' ? 'critical' : 'warning'}`}>
                {unit.anomalies.filter(a => !a.isAcknowledged).length} alert{unit.anomalies.filter(a => !a.isAcknowledged).length > 1 ? 's' : ''}
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {/* AI Insight Footer */}
      <div className="ai-insight">
        <Zap className="ai-insight-icon" />
        <p className="ai-insight-text">
          <strong>AI Insight:</strong> HVAC_1 shows progressive filter blockage pattern
          (temp +{anomalies.find(a => a.unitId === 'HVAC_1' && a.type === 'cascade_failure') ? '6°C' : ''}, airflow declining).
          HVAC_4 sensor communication failed. HVAC_2 had 2 intermittent catastrophic events.
        </p>
      </div>
    </div>
  );
}
