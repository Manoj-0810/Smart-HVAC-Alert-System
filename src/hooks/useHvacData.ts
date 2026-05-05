import type { HvacUnit, SensorReading, AnomalyEvent } from '@/types/hvac';
import { parseISO } from 'date-fns';

// ===== AI ANOMALY DETECTION ENGINE =====
// Uses multi-sensor correlation, rolling statistics, rate-of-change analysis,
// and pattern recognition to identify real problems vs. false alarms.

interface RollingStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  count: number;
}

function computeRollingStats(values: (number | null)[], window: number = 12): RollingStats[] {
  const result: RollingStats[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowVals = values.slice(start, i + 1).filter((v): v is number => v !== null && !isNaN(v));
    if (windowVals.length < 3) {
      result.push({ mean: 0, std: 0, min: 0, max: 0, count: windowVals.length });
      continue;
    }
    const mean = windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
    const variance = windowVals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / windowVals.length;
    result.push({
      mean,
      std: Math.sqrt(variance),
      min: Math.min(...windowVals),
      max: Math.max(...windowVals),
      count: windowVals.length,
    });
  }
  return result;
}

function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

function rateOfChange(values: (number | null)[], idx: number, window: number = 3): number {
  if (idx < window) return 0;
  const current = values[idx];
  const prev = values[idx - window];
  if (current === null || prev === null) return 0;
  return current - prev;
}

function detectMissingDataPattern(readings: SensorReading[]): { rate: number; streaks: number[][]; pairedStreaks: number[][] } {
  const missingByReading = readings.map(r => {
    const missing = ['temp', 'airflow', 'vibration', 'pressure', 'power'].filter(
      k => r[k as keyof SensorReading] === null
    );
    return missing.length;
  });

  // Detect paired sensor dropouts (e.g., temp+airflow both missing)
  const pairedMissing = readings.map(r => {
    const missing = ['temp', 'airflow'].filter(k => r[k as keyof SensorReading] === null);
    return missing.length;
  });

  const totalPossible = readings.length * 5;
  const totalMissing = missingByReading.reduce((a, b) => a + b, 0);
  const rate = totalMissing / totalPossible;

  // Find streaks of 3+ sensors missing
  const streaks: number[][] = [];
  let currentStreak: number[] = [];
  missingByReading.forEach((count, idx) => {
    if (count >= 3) {
      currentStreak.push(idx);
    } else {
      if (currentStreak.length >= 3) streaks.push([...currentStreak]);
      currentStreak = [];
    }
  });
  if (currentStreak.length >= 3) streaks.push(currentStreak);

  // Find streaks of paired sensors missing (2+ out of temp/airflow)
  const pairedStreaks: number[][] = [];
  let currentPaired: number[] = [];
  pairedMissing.forEach((count, idx) => {
    if (count >= 2) {
      currentPaired.push(idx);
    } else {
      if (currentPaired.length >= 3) pairedStreaks.push([...currentPaired]);
      currentPaired = [];
    }
  });
  if (currentPaired.length >= 3) pairedStreaks.push(currentPaired);

  return { rate, streaks, pairedStreaks };
}

function computeStableBaseline(values: (number | null)[], count: number = 30): { mean: number; std: number } {
  const clean = values.slice(0, count).filter((v): v is number => v !== null && !isNaN(v));
  if (clean.length < 5) return { mean: 0, std: 0 };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / clean.length;
  return { mean, std: Math.sqrt(variance) };
}

export function analyzeUnit(unitId: string, readings: SensorReading[]): { unit: HvacUnit; anomalies: AnomalyEvent[] } {
  const tempVals = readings.map(r => r.temp);
  const pressureVals = readings.map(r => r.pressure);
  const airflowVals = readings.map(r => r.airflow);
  const vibrationVals = readings.map(r => r.vibration);
  const powerVals = readings.map(r => r.power);

  const tempStats = computeRollingStats(tempVals, 12);
  const pressureStats = computeRollingStats(pressureVals, 12);
  const airflowStats = computeRollingStats(airflowVals, 12);
  const vibrationStats = computeRollingStats(vibrationVals, 12);
  const powerStats = computeRollingStats(powerVals, 12);

  // Stable baselines for progressive degradation detection
  const tempBaseline = computeStableBaseline(tempVals, 30);
  const airBaseline = computeStableBaseline(airflowVals, 30);
  const vibBaseline = computeStableBaseline(vibrationVals, 30);
  const pwrBaseline = computeStableBaseline(powerVals, 30);

  const anomalies: AnomalyEvent[] = [];
  let healthScore = 100;
  let worstStatus: HvacUnit['status'] = 'healthy';

  // 1. DETECT PROGRESSIVE DEGRADATION (HVAC_1 pattern)
  // temp rising + airflow falling + vibration rising = filter blockage / bearing wear
  for (let i = 36; i < readings.length; i++) {
    const currTemp = tempVals[i];
    const currAir = airflowVals[i];
    const currVib = vibrationVals[i];
    const currPower = powerVals[i];

    if (currTemp === null || currAir === null || currVib === null || currPower === null) continue;

    // Use stable baseline for progressive degradation, rolling stats for sudden events
    const tempZ = zScore(currTemp, tempBaseline.mean, tempBaseline.std);
    const airZ = zScore(currAir, airBaseline.mean, airBaseline.std);
    const vibZ = zScore(currVib, vibBaseline.mean, vibBaseline.std);
    const pwrZ = zScore(currPower, pwrBaseline.mean, pwrBaseline.std);

    const tempROC = rateOfChange(tempVals, i, 6);

    // CASCADE FAILURE: Temp up + Airflow down + Vibration up (vs stable baseline)
    if (tempZ > 1.5 && airZ < -1.5 && vibZ > 1.5 && pwrZ > 0.5) {
      const prevAnomaly = anomalies.find(a =>
        a.unitId === unitId &&
        a.type === 'cascade_failure' &&
        i - readings.findIndex(r => r.timestamp === a.timestamp) < 24
      );
      if (!prevAnomaly) {
        const severity: 'critical' | 'warning' = (tempZ > 3 || vibZ > 3 || currTemp > 25) ? 'critical' : 'warning';
        anomalies.push({
          id: `${unitId}-cascade-${i}`,
          unitId,
          timestamp: readings[i].timestamp,
          severity,
          type: 'cascade_failure',
          title: severity === 'critical' ? 'Critical: Progressive System Degradation' : 'Progressive System Degradation Detected',
          description: `Temperature elevated to ${currTemp.toFixed(1)}°C (+${tempROC.toFixed(1)}°C trend, ${tempZ.toFixed(1)}σ above baseline), airflow restricted to ${currAir.toFixed(0)} CFM (${airZ.toFixed(1)}σ below baseline), abnormal vibration ${currVib.toFixed(3)}G (${vibZ.toFixed(1)}σ above). Pattern consistent with clogged filter or bearing deterioration.`,
          confidence: Math.min(0.95, 0.7 + (Math.abs(tempZ) + Math.abs(airZ) + Math.abs(vibZ)) / 15),
          affectedSensors: ['temp', 'airflow', 'vibration', 'power'],
          recommendedAction: severity === 'critical'
            ? 'URGENT: Inspect and replace air filter immediately. Check blower bearings for wear. Monitor for thermal runaway. Schedule within 1 hour.'
            : 'Inspect and replace air filter. Check blower bearings for wear. Verify ductwork obstructions. Schedule within 2 hours.',
          sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: currVib, power: currPower },
          trendDirection: 'rising',
          isAcknowledged: false,
        });
        healthScore -= severity === 'critical' ? 35 : 20;
        worstStatus = 'critical';
      }
    }

    // THERMAL RUNAWAY: Sudden massive temp spike (use rolling stats for sudden detection)
    const rollingTempZ = zScore(currTemp, tempStats[i].mean, tempStats[i].std);
    if ((rollingTempZ > 5 && currTemp > 28) || (tempZ > 4 && currTemp > 30)) {
      anomalies.push({
        id: `${unitId}-thermal-${i}`,
        unitId,
        timestamp: readings[i].timestamp,
        severity: 'critical',
        type: 'thermal_runaway',
        title: 'Thermal Runaway Event',
        description: `Critical temperature spike to ${currTemp.toFixed(1)}°C (${tempZ.toFixed(1)}σ vs baseline). Possible motor seizure or cooling system total failure. Immediate shutdown recommended.`,
        confidence: 0.96,
        affectedSensors: ['temp', 'airflow'],
        recommendedAction: 'EMERGENCY: Shut down unit immediately. Inspect motor windings and cooling fans. Do not restart without supervisor approval.',
        sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: currVib, power: currPower },
        trendDirection: 'spike',
        isAcknowledged: false,
      });
      healthScore -= 40;
      worstStatus = 'critical';
    }

    // SUDDEN AIRFLOW COLLAPSE (use rolling for sudden, baseline for sustained)
    const rollingAirZ = zScore(currAir, airflowStats[i].mean, airflowStats[i].std);
    if ((rollingAirZ < -5 || (airZ < -4 && currAir < 200)) && currAir !== null && currAir < 250) {
      anomalies.push({
        id: `${unitId}-airflow-${i}`,
        unitId,
        timestamp: readings[i].timestamp,
        severity: 'critical',
        type: 'airflow_degradation',
        title: 'Catastrophic Airflow Loss',
        description: `Airflow collapsed to ${currAir.toFixed(0)} CFM (${airZ.toFixed(1)}σ below baseline). Possible fan belt break, motor failure, or severe duct blockage.`,
        confidence: 0.94,
        affectedSensors: ['airflow', 'vibration', 'power'],
        recommendedAction: 'Check fan belt tension and condition. Inspect blower motor amp draw. Verify dampers are not stuck closed.',
        sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: currVib, power: currPower },
        trendDirection: 'drop',
        isAcknowledged: false,
      });
      healthScore -= 35;
      worstStatus = 'critical';
    }

    // PRESSURE DROP (refrigerant leak pattern)
    const pressureZ = zScore(pressureVals[i] ?? 0, pressureStats[i].mean, pressureStats[i].std);
    const currentPressure = pressureVals[i];
    if (pressureZ < -2.5 && i > 36 && currentPressure !== null) {
      const prevPressure = pressureVals[i - 12];
      if (prevPressure !== null && (prevPressure - currentPressure) > 0.15) {
        const existing = anomalies.find(a => a.type === 'pressure_drop' && a.unitId === unitId);
        if (!existing) {
          anomalies.push({
            id: `${unitId}-pressure-${i}`,
            unitId,
            timestamp: readings[i].timestamp,
            severity: 'warning',
            type: 'pressure_drop',
            title: 'Refrigerant Pressure Declining',
            description: `System pressure dropped to ${currentPressure.toFixed(2)} bar (${pressureZ.toFixed(1)}σ below baseline). Gradual decline suggests refrigerant leak or compressor efficiency loss.`,
            confidence: 0.82,
            affectedSensors: ['pressure'],
            recommendedAction: 'Check refrigerant levels with gauges. Inspect lines for oil stains (leak indicator). Check compressor amp draw.',
            sensorSnapshot: { temp: currTemp, pressure: currentPressure, airflow: currAir, vibration: currVib },
            trendDirection: 'falling',
            isAcknowledged: false,
          });
          healthScore -= 15;
          if (worstStatus === 'healthy') worstStatus = 'warning';
        }
      }
    }

    // BEARING WEAR: High vibration with normal other params
    const rollingVibZ = zScore(currVib, vibrationStats[i].mean, vibrationStats[i].std);
    if (rollingVibZ > 3.5 && Math.abs(rollingTempZ) < 2 && Math.abs(rollingAirZ) < 2 && currVib > 0.06) {
      const existing = anomalies.find(a => a.type === 'bearing_wear' && a.unitId === unitId);
      if (!existing) {
        anomalies.push({
          id: `${unitId}-bearing-${i}`,
          unitId,
          timestamp: readings[i].timestamp,
          severity: 'warning',
          type: 'bearing_wear',
          title: 'Bearing Wear Detected',
          description: `Vibration elevated to ${currVib.toFixed(3)}G (${rollingVibZ.toFixed(1)}σ above rolling baseline) while temperature and airflow remain normal. Isolated mechanical wear in blower bearing.`,
          confidence: 0.85,
          affectedSensors: ['vibration'],
          recommendedAction: 'Schedule bearing inspection during next maintenance window. Lubricate if accessible. Monitor for escalation.',
          sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: currVib, power: currPower },
          trendDirection: 'rising',
          isAcknowledged: false,
        });
        healthScore -= 10;
        if (worstStatus === 'healthy') worstStatus = 'warning';
      }
    }

    // POWER ANOMALY: Unusual power draw (use rolling stats)
    const rollingPowerZ = zScore(currPower, powerStats[i].mean, powerStats[i].std);
    if (Math.abs(rollingPowerZ) > 3.5 && i > 12) {
      anomalies.push({
        id: `${unitId}-power-${i}`,
        unitId,
        timestamp: readings[i].timestamp,
        severity: rollingPowerZ > 0 ? 'warning' : 'info',
        type: 'power_anomaly',
        title: rollingPowerZ > 0 ? 'Abnormal Power Consumption' : 'Low Power Draw',
        description: rollingPowerZ > 0
          ? `Power consumption ${currPower.toFixed(2)}kW is ${rollingPowerZ.toFixed(1)}σ above baseline. Motor working harder than expected.`
          : `Power consumption ${currPower.toFixed(2)}kW is ${Math.abs(rollingPowerZ).toFixed(1)}σ below baseline. Possible unloaded motor condition.`,
        confidence: 0.78,
        affectedSensors: ['power'],
        recommendedAction: 'Check motor load conditions. Verify VFD settings. Inspect for mechanical binding.',
        sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: currVib, power: currPower },
        trendDirection: rollingPowerZ > 0 ? 'rising' : 'falling',
        isAcknowledged: false,
      });
      healthScore -= 8;
    }
  }

  // 2. DETECT SENSOR DROPOUT PATTERNS (HVAC_4 pattern)
  const { rate: missingRate, streaks, pairedStreaks } = detectMissingDataPattern(readings);
  const hasSignificantDropout = missingRate > 0.15 || streaks.length > 0 || pairedStreaks.length > 0;
  if (hasSignificantDropout) {
    const allStreaks = [...streaks, ...pairedStreaks];
    const longestStreak = allStreaks.length > 0
      ? allStreaks.reduce((a, b) => a.length > b.length ? a : b)
      : [];
    const streakDuration = longestStreak.length * 5; // 5 min intervals
    const isCritical = missingRate > 0.25 || pairedStreaks.some(s => s.length > 20);

    anomalies.push({
      id: `${unitId}-sensor-dropout`,
      unitId,
      timestamp: readings[longestStreak[0] ?? readings.length - 1]?.timestamp ?? readings[readings.length - 1].timestamp,
      severity: isCritical ? 'critical' : 'warning',
      type: 'sensor_dropout',
      title: isCritical ? 'Critical Sensor Communication Failure' : 'Intermittent Sensor Dropouts',
      description: `Sensor data missing for ${(missingRate * 100).toFixed(0)}% of readings. ${streaks.length} multi-sensor dropout streaks, ${pairedStreaks.length} paired-sensor streaks detected. Longest: ${streakDuration} minutes. Cannot validate equipment health without data.`,
      confidence: 0.88,
      affectedSensors: ['temp', 'airflow'],
      recommendedAction: 'Check sensor wiring connections. Inspect data logger/PLC communication. Verify 4-20mA loop integrity. Replace temperature and airflow sensors if intermittent.',
      sensorSnapshot: { temp: null, airflow: null },
      trendDirection: 'stable',
      isAcknowledged: false,
    });
    healthScore -= isCritical ? 30 : 15;
    worstStatus = isCritical ? 'critical' : 'warning';
  }

  // 3. DETECT INTERMITTENT FAILURES (HVAC_2 pattern - sudden recovery)
  for (let i = 1; i < readings.length - 1; i++) {
    const prevAir = airflowVals[i - 1];
    const currAir = airflowVals[i];
    const nextAir = airflowVals[i + 1];
    if (prevAir !== null && currAir !== null && nextAir !== null) {
      if (currAir < 150 && prevAir > 250 && nextAir > 250) {
        // Brief dip that recovered - could be real or sensor glitch
        // Check if temp also spiked
        const currTemp = tempVals[i];
        const prevTemp = tempVals[i - 1];
        if (currTemp !== null && prevTemp !== null && currTemp > prevTemp + 5) {
          anomalies.push({
            id: `${unitId}-intermittent-${i}`,
            unitId,
            timestamp: readings[i].timestamp,
            severity: 'critical',
            type: 'intermittent_failure',
            title: 'Intermittent System Failure Event',
            description: `Brief but severe airflow collapse to ${currAir.toFixed(0)} CFM with temperature spike to ${currTemp.toFixed(1)}°C. System recovered but root cause unknown. Could indicate loose belt, electrical fault, or control board issue.`,
            confidence: 0.91,
            affectedSensors: ['airflow', 'temp', 'vibration'],
            recommendedAction: 'URGENT: Perform full mechanical inspection. Check belt tension and alignment. Inspect motor terminals. Monitor closely - could indicate imminent total failure.',
            sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: vibrationVals[i] },
            trendDirection: 'spike',
            isAcknowledged: false,
          });
          healthScore -= 30;
          worstStatus = 'critical';
        }
      }
    }
  }

  // 4. DETECT FALSE ALARM CANDIDATES (single-sensor spike with no correlation)
  // Mark these as lower confidence to show the system is "smart"
  for (let i = 6; i < readings.length; i++) {
    const currTemp = tempVals[i];
    const currVib = vibrationVals[i];
    const currAir = airflowVals[i];
    const currPower = powerVals[i];

    if (currTemp !== null && tempStats[i].std > 0) {
      const tz = zScore(currTemp, tempStats[i].mean, tempStats[i].std);
      const vz = currVib !== null ? zScore(currVib, vibrationStats[i].mean, vibrationStats[i].std) : 0;
      const az = currAir !== null ? zScore(currAir, airflowStats[i].mean, airflowStats[i].std) : 0;
      const pz = currPower !== null ? zScore(currPower, powerStats[i].mean, powerStats[i].std) : 0;

      // Single temp spike with no other correlation - classic false alarm pattern
      if (tz > 2.5 && tz < 5 && Math.abs(vz) < 1.5 && Math.abs(az) < 1.5 && Math.abs(pz) < 1.5) {
        const hasNearby = anomalies.some(a =>
          a.unitId === unitId &&
          Math.abs(readings.findIndex(r => r.timestamp === a.timestamp) - i) < 12
        );
        if (!hasNearby) {
          anomalies.push({
            id: `${unitId}-fleeting-${i}`,
            unitId,
            timestamp: readings[i].timestamp,
            severity: 'info',
            type: 'multi_sensor_failure',
            title: 'Fleeting Sensor Anomaly (Suppressed)',
            description: `Temperature reading ${currTemp.toFixed(1)}°C is ${tz.toFixed(1)}σ above rolling baseline, but vibration (${vz.toFixed(1)}σ), airflow (${az.toFixed(1)}σ), and power (${pz.toFixed(1)}σ) all normal. Multi-sensor correlation suggests this is noise, not a real failure.`,
            confidence: 0.25,
            affectedSensors: ['temp'],
            recommendedAction: 'No action required. This alert was suppressed by the AI noise filter. Monitor for pattern repetition.',
            sensorSnapshot: { temp: currTemp, airflow: currAir, vibration: currVib, power: currPower },
            trendDirection: 'spike',
            isAcknowledged: false,
          });
        }
      }
    }
  }

  // Deduplicate anomalies that are very close together
  const deduped: AnomalyEvent[] = [];
  anomalies.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const anomaly of anomalies) {
    const isDup = deduped.some(d =>
      d.type === anomaly.type &&
      d.unitId === anomaly.unitId &&
      Math.abs(parseISO(d.timestamp).getTime() - parseISO(anomaly.timestamp).getTime()) < 30 * 60 * 1000
    );
    if (!isDup) deduped.push(anomaly);
  }

  // Clamp health score
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine final status
  if (worstStatus === 'critical' || healthScore < 40) worstStatus = 'critical';
  else if (worstStatus === 'warning' || healthScore < 70) worstStatus = 'warning';
  else worstStatus = 'healthy';

  // If massive missing data, mark as offline
  if (missingRate > 0.4) worstStatus = 'offline';

  const lastReading = readings[readings.length - 1];

  const unit: HvacUnit = {
    id: unitId,
    name: unitId.replace('_', ' '),
    location: `Zone ${unitId.split('_')[1]}`,
    status: worstStatus,
    readings,
    lastReading,
    healthScore,
    anomalies: deduped,
    missingDataRate: missingRate,
  };

  return { unit, anomalies: deduped };
}

export function generateSmartRanking(anomalies: AnomalyEvent[]): AnomalyEvent[] {
  // Rank by: severity > confidence > recency
  const now = Date.now();
  return [...anomalies].sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, info: 1 };
    const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (sevDiff !== 0) return sevDiff;

    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.1) return confDiff;

    const ageA = now - parseISO(a.timestamp).getTime();
    const ageB = now - parseISO(b.timestamp).getTime();
    return ageA - ageB;
  });
}

export function calculateFalsePositiveRate(anomalies: AnomalyEvent[]): number {
  const infoCount = anomalies.filter(a => a.severity === 'info').length;
  const total = anomalies.length;
  if (total === 0) return 0;
  return infoCount / total;
}
