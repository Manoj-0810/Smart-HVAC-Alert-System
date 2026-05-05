import type { AnomalyEvent, HvacUnit } from '@/types/hvac';
import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle, Activity, Filter,
  ChevronRight, ShieldCheck
} from 'lucide-react';
import { useState } from 'react';

interface AlertPanelProps {
  anomalies: AnomalyEvent[];
  onAcknowledge: (anomalyId: string) => void;
  onAcknowledgeAll: () => void;
  units: HvacUnit[];
  onUnitSelect: (unitId: string) => void;
}

export function AlertPanel({ anomalies, onAcknowledge, onAcknowledgeAll, units, onUnitSelect }: AlertPanelProps) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');

  const filtered = filter === 'all'
    ? anomalies
    : anomalies.filter(a => a.severity === filter);

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;
  const infoCount = anomalies.filter(a => a.severity === 'info').length;

  // Group by unit
  const byUnit = filtered.reduce<Record<string, AnomalyEvent[]>>((acc, a) => {
    if (!acc[a.unitId]) acc[a.unitId] = [];
    acc[a.unitId].push(a);
    return acc;
  }, {});

  return (
    <div className="alert-panel">
      {/* Stats */}
      <div className="alert-stats">
        <div className="alert-stat-card">
          <span className="alert-stat-value critical">{criticalCount}</span>
          <span className="alert-stat-label">Critical</span>
        </div>
        <div className="alert-stat-card">
          <span className="alert-stat-value warning">{warningCount}</span>
          <span className="alert-stat-label">Warning</span>
        </div>
        <div className="alert-stat-card">
          <span className="alert-stat-value info">{infoCount}</span>
          <span className="alert-stat-label">Filtered</span>
        </div>
      </div>

      {/* AI Insight */}
      <div className="ai-insight">
        <ShieldCheck className="ai-insight-icon" />
        <p className="ai-insight-text">
          <strong>Smart Filtering Active:</strong> Using multi-sensor correlation to suppress
          false positives. {infoCount} low-confidence events hidden. Only showing actionable alerts.
        </p>
      </div>

      {/* Filter Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['all', 'critical', 'warning'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: filter === f ? 'var(--bg-elevated)' : 'transparent',
              color: filter === f ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f} {f === 'all' ? `(${anomalies.length})` : f === 'critical' ? `(${criticalCount})` : `(${warningCount})`}
          </button>
        ))}
      </div>

      {anomalies.length > 0 && (
        <button className="ack-all-btn" onClick={onAcknowledgeAll}>
          <CheckCircle size={18} />
          Acknowledge All Alerts
        </button>
      )}

      {/* Alert List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <Filter className="empty-state-icon" />
          <span className="empty-state-text">No alerts match this filter</span>
          <span className="empty-state-subtext">All caught up. The AI is monitoring.</span>
        </div>
      ) : (
        <div className="alert-list">
          {Object.entries(byUnit).map(([unitId, unitAlerts]) => {
            const unit = units.find(u => u.id === unitId);
            return (
              <div key={unitId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
                  <Activity size={14} color="var(--accent-cyan)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {unitId.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {unit?.location}
                  </span>
                </div>

                {unitAlerts.map((alert, idx) => (
                  <motion.div
                    key={alert.id}
                    className={`alert-item ${alert.severity}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <span className={`alert-severity-badge ${alert.severity}`}>
                        {alert.severity === 'critical' && <AlertTriangle size={12} />}
                        {alert.severity}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {(alert.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>

                    <p className="alert-title">{alert.title}</p>
                    <p className="alert-description">{alert.description}</p>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="ack-btn"
                        onClick={() => onAcknowledge(alert.id)}
                        style={{ flex: 1 }}
                      >
                        <CheckCircle size={14} />
                        Acknowledge
                      </button>
                      <button
                        className="alert-action-btn"
                        onClick={() => onUnitSelect(unitId)}
                        style={{ flex: 1 }}
                      >
                        Go to Unit <ChevronRight size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
