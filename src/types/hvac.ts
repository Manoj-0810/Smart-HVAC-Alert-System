
export interface SensorReading {
  timestamp: string;
  temp: number | null;
  pressure: number | null;
  airflow: number | null;
  vibration: number | null;
  power: number | null;
}

export interface HvacUnit {
  id: string;
  name: string;
  location: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  readings: SensorReading[];
  lastReading: SensorReading | null;
  healthScore: number;
  anomalies: AnomalyEvent[];
  missingDataRate: number;
}

export interface AnomalyEvent {
  id: string;
  unitId: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info';
  type: AnomalyType;
  title: string;
  description: string;
  confidence: number;
  affectedSensors: string[];
  recommendedAction: string;
  sensorSnapshot: {
    temp?: number | null;
    pressure?: number | null;
    airflow?: number | null;
    vibration?: number | null;
    power?: number | null;
  };
  trendDirection: 'rising' | 'falling' | 'spike' | 'drop' | 'stable';
  isAcknowledged: boolean;
}

export type AnomalyType =
  | 'thermal_runaway'
  | 'airflow_degradation'
  | 'bearing_wear'
  | 'pressure_drop'
  | 'sensor_dropout'
  | 'power_anomaly'
  | 'multi_sensor_failure'
  | 'cascade_failure'
  | 'intermittent_failure'
  | 'refrigerant_leak';

export type ViewState = 'dashboard' | 'unit-detail' | 'alerts' | 'settings';

export interface AlertStats {
  total: number;
  critical: number;
  warning: number;
  info: number;
  acknowledged: number;
  falsePositiveRate: number;
}
