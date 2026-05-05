import { useState, useEffect, useCallback } from 'react';
import type { HvacUnit, ViewState, AnomalyEvent } from '@/types/hvac';
import { analyzeUnit, generateSmartRanking, calculateFalsePositiveRate } from '@/hooks/useHvacData';
import { Dashboard } from '@/sections/Dashboard';
import { UnitDetail } from '@/sections/UnitDetail';
import { AlertPanel } from '@/sections/AlertPanel';
import { StatusBar } from '@/sections/StatusBar';
import { BottomNav } from '@/sections/BottomNav';
import { parseISO } from 'date-fns';
import './App.css';

function App() {
  const [view, setView] = useState<ViewState>('dashboard');
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [units, setUnits] = useState<HvacUnit[]>([]);
  const [allAnomalies, setAllAnomalies] = useState<AnomalyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Simulate real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load and analyze data
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/hvac_sensor_data.csv');
        const text = await response.text();
        const lines = text.trim().split('\n');
        lines[0].split(','); // skip header

        const rawData: Record<string, { timestamp: string; temp: number | null; pressure: number | null; airflow: number | null; vibration: number | null; power: number | null }[]> = {};

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          if (cols.length < 6) continue;
          const unitId = cols[1];
          if (!rawData[unitId]) rawData[unitId] = [];
          rawData[unitId].push({
            timestamp: cols[0],
            temp: cols[2] === '' ? null : parseFloat(cols[2]),
            pressure: cols[3] === '' ? null : parseFloat(cols[3]),
            airflow: cols[4] === '' ? null : parseFloat(cols[4]),
            vibration: cols[5] === '' ? null : parseFloat(cols[5]),
            power: cols[6] === '' ? null : parseFloat(cols[6]),
          });
        }

        const analyzedUnits: HvacUnit[] = [];
        const allAnom: AnomalyEvent[] = [];

        for (const [unitId, readings] of Object.entries(rawData)) {
          readings.sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());
          const { unit, anomalies } = analyzeUnit(unitId, readings);
          analyzedUnits.push(unit);
          allAnom.push(...anomalies);
        }

        analyzedUnits.sort((a, b) => a.id.localeCompare(b.id));
        setUnits(analyzedUnits);
        setAllAnomalies(allAnom);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleUnitSelect = useCallback((unitId: string) => {
    setSelectedUnit(unitId);
    setView('unit-detail');
  }, []);

  const handleBack = useCallback(() => {
    if (view === 'unit-detail') {
      setView('dashboard');
      setSelectedUnit(null);
    } else if (view === 'alerts') {
      setView('dashboard');
    }
  }, [view]);

  const handleAcknowledge = useCallback((anomalyId: string) => {
    setAllAnomalies(prev => prev.map(a =>
      a.id === anomalyId ? { ...a, isAcknowledged: true } : a
    ));
    setUnits(prev => prev.map(u => ({
      ...u,
      anomalies: u.anomalies.map(a =>
        a.id === anomalyId ? { ...a, isAcknowledged: true } : a
      )
    })));
  }, []);

  const handleAcknowledgeAll = useCallback((unitId?: string) => {
    const toAck = unitId
      ? allAnomalies.filter(a => a.unitId === unitId && !a.isAcknowledged).map(a => a.id)
      : allAnomalies.filter(a => !a.isAcknowledged).map(a => a.id);

    setAllAnomalies(prev => prev.map(a =>
      toAck.includes(a.id) ? { ...a, isAcknowledged: true } : a
    ));

    setUnits(prev => prev.map(u => ({
      ...u,
      anomalies: u.anomalies.map(a =>
        toAck.includes(a.id) ? { ...a, isAcknowledged: true } : a
      )
    })));
  }, [allAnomalies]);

  const activeAnomalies = allAnomalies.filter(a => !a.isAcknowledged);
  const rankedAnomalies = generateSmartRanking(activeAnomalies);
  const fpRate = calculateFalsePositiveRate(allAnomalies);

  const selectedUnitData = selectedUnit ? units.find(u => u.id === selectedUnit) : null;

  if (loading) {
    return (
      <div className="mobile-container">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p className="loading-text">Analyzing sensor data...</p>
          <p className="loading-subtext">Running multi-sensor correlation AI</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container">
      <StatusBar
        view={view}
        currentTime={currentTime}
        activeAlertCount={activeAnomalies.length}
        onBack={handleBack}
        onAlertsClick={() => setView('alerts')}
      />

      <main className="main-content">
        {view === 'dashboard' && (
          <Dashboard
            units={units}
            anomalies={rankedAnomalies}
            onUnitSelect={handleUnitSelect}
            onViewAlerts={() => setView('alerts')}
            fpRate={fpRate}
          />
        )}

        {view === 'unit-detail' && selectedUnitData && (
          <UnitDetail
            unit={selectedUnitData}
            onAcknowledge={handleAcknowledge}
            onAcknowledgeAll={() => handleAcknowledgeAll(selectedUnitData.id)}
          />
        )}

        {view === 'alerts' && (
          <AlertPanel
            anomalies={rankedAnomalies}
            onAcknowledge={handleAcknowledge}
            onAcknowledgeAll={() => handleAcknowledgeAll()}
            units={units}
            onUnitSelect={handleUnitSelect}
          />
        )}
      </main>

      <BottomNav
        currentView={view}
        onNavigate={(v) => {
          setView(v);
          if (v === 'dashboard') setSelectedUnit(null);
        }}
        alertCount={activeAnomalies.length}
      />
    </div>
  );
}

export default App;
