import type { HvacUnit } from '@/types/hvac';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import {
  Thermometer, Wind, Activity, Gauge, Zap, AlertTriangle,
  CheckCircle, MapPin
} from 'lucide-react';

interface UnitDetailProps {
  unit: HvacUnit;
  onAcknowledge: (anomalyId: string) => void;
  onAcknowledgeAll: () => void;
}

export function UnitDetail({ unit, onAcknowledge, onAcknowledgeAll }: UnitDetailProps) {
  const activeAnomalies = unit.anomalies.filter(a => !a.isAcknowledged);

  // Build chart data - sample every 3rd point to avoid crowding
  const chartData = unit.readings
    .filter((_, i) => i % 2 === 0)
    .map(r => ({
      time: format(parseISO(r.timestamp), 'HH:mm'),
      temp: r.temp ?? null,
      airflow: r.airflow ?? null,
      vibration: r.vibration ? r.vibration * 1000 : null, // scale up for visibility
      pressure: r.pressure ?? null,
      power: r.power ?? null,
    }));

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'warning': return 'Warning';
      case 'critical': return 'Critical';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  };

  const sensorCards = [
    {
      label: 'Temperature',
      icon: Thermometer,
      value: unit.lastReading?.temp,
      unit: '°C',
      color: '#ef4444',
      normalRange: '21-23°C',
    },
    {
      label: 'Pressure',
      icon: Gauge,
      value: unit.lastReading?.pressure,
      unit: 'bar',
      color: '#3b82f6',
      normalRange: '1.1-1.3 bar',
    },
    {
      label: 'Airflow',
      icon: Wind,
      value: unit.lastReading?.airflow,
      unit: 'CFM',
      color: '#06b6d4',
      normalRange: '310-330 CFM',
    },
    {
      label: 'Vibration',
      icon: Activity,
      value: unit.lastReading?.vibration,
      unit: 'G',
      color: '#f59e0b',
      normalRange: '<0.03G',
    },
    {
      label: 'Power',
      icon: Zap,
      value: unit.lastReading?.power,
      unit: 'kW',
      color: '#8b5cf6',
      normalRange: '4.5-5.5 kW',
    },
  ];

  return (
    <div className="unit-detail">
      {/* Hero Card */}
      <motion.div
        className="unit-hero"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="unit-hero-header">
          <div className="unit-hero-title">
            <span className="unit-hero-name">{unit.name}</span>
            <span className="unit-hero-location">
              <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
              {unit.location} · Zone Controller
            </span>
          </div>
          <span className={`unit-hero-status ${unit.status}`}>
            {unit.status === 'critical' && <AlertTriangle size={14} />}
            {getStatusLabel(unit.status)}
          </span>
        </div>

        <div className="live-metrics">
          {sensorCards.map((sensor, idx) => (
            <motion.div
              key={sensor.label}
              className="metric-box"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <sensor.icon className="metric-icon" style={{ color: sensor.color }} />
              <span className="metric-label">{sensor.label}</span>
              <span className={`metric-value ${sensor.value === null || sensor.value === undefined ? 'missing' : ''}`}>
                {sensor.value !== null && sensor.value !== undefined ? sensor.value.toFixed(sensor.unit === '°C' ? 1 : sensor.unit === 'G' ? 3 : 0) : 'N/A'}
              </span>
              <span className="metric-unit">{sensor.unit}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Temperature Chart */}
      <div className="chart-container">
        <span className="chart-title">Temperature Trend</span>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} domain={['dataMin - 1', 'dataMax + 2']} />
              <Tooltip
                contentStyle={{
                  background: '#1a2234',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Critical', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={23} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Warning', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Airflow Chart */}
      <div className="chart-container">
        <span className="chart-title">Airflow Trend</span>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} domain={['dataMin - 20', 'dataMax + 20']} />
              <Tooltip
                contentStyle={{
                  background: '#1a2234',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <ReferenceLine y={250} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Low', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="airflow" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vibration & Power */}
      <div className="chart-container">
        <span className="chart-title">Vibration & Power</span>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} />
              <YAxis yAxisId="vib" orientation="left" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} />
              <YAxis yAxisId="pwr" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#1e293b' }} />
              <Tooltip
                contentStyle={{
                  background: '#1a2234',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line yAxisId="vib" type="monotone" dataKey="vibration" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line yAxisId="pwr" type="monotone" dataKey="power" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Anomaly Timeline */}
      {unit.anomalies.length > 0 && (
        <div className="anomaly-timeline">
          <div className="section-header">
            <span className="section-title">Detected Events</span>
            {activeAnomalies.length > 0 && (
              <button className="section-action" onClick={onAcknowledgeAll}>
                Acknowledge All
              </button>
            )}
          </div>

          {unit.anomalies.slice(0, 6).map((anomaly) => (
            <motion.div
              key={anomaly.id}
              className={`timeline-item ${anomaly.severity}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="timeline-item-header">
                <span className={`alert-severity-badge ${anomaly.severity}`}>
                  {anomaly.severity}
                </span>
                <span className="timeline-time">
                  {format(parseISO(anomaly.timestamp), 'h:mm a')}
                </span>
              </div>
              <p className="timeline-title">{anomaly.title}</p>
              <p className="timeline-desc">{anomaly.description}</p>
              <p className="timeline-action">
                <strong>Action:</strong> {anomaly.recommendedAction}
              </p>
              {!anomaly.isAcknowledged && (
                <button
                  className="ack-btn"
                  onClick={() => onAcknowledge(anomaly.id)}
                >
                  <CheckCircle size={14} />
                  Acknowledge
                </button>
              )}
              {anomaly.isAcknowledged && (
                <span style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={14} /> Acknowledged
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <div className="scroll-hint">Scroll for more history</div>
    </div>
  );
}
