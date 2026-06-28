'use client';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { io, Socket } from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api';

interface Vehicle {
  id: string;
  regNumber: string;
  make: string;
  model: string;
  status: string;
  driver: string | null;
  speed: number;
  location: { lat: number; lng: number };
}

interface GpsUpdate {
  vehicleId: string;
  regNumber: string;
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
}

const STATUS_COLOR: Record<string, string> = {
  Running: '#16a34a',
  Idle: '#ca8a04',
  Maintenance: '#2563eb',
  Breakdown: '#dc2626',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001';
const ADDIS_ABABA: [number, number] = [9.0192, 38.7468];

function fmtTime(ts: string | null) {
  if (!ts) return 'No live signal yet';
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function TrackingPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [lastPing, setLastPing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setMounted(true);
    api.fleet().then(setVehicles).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('gps:update', (update: GpsUpdate) => {
      setVehicles(prev => prev.map(v => v.id === update.vehicleId
        ? { ...v, location: { lat: update.lat, lng: update.lng }, speed: update.speed }
        : v));
      setLastPing(prev => ({ ...prev, [update.vehicleId]: update.timestamp }));
    });

    return () => { socket.disconnect(); };
  }, [mounted]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Live Tracking</h2>
          <p className="text-sm text-slate-500 mt-0.5">Real-time vehicle positions from connected GPS devices.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${connected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-400'}`} />
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2.5 rounded-xl">
        No GPS hardware is connected yet — positions shown below are last-known/manually-set locations. Once a vehicle's
        tracker starts sending pings to <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">POST /api/gps/ping</code>, its marker will move here in real time.
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" style={{ height: 560 }}>
        {mounted && (
          <MapContainer center={ADDIS_ABABA} zoom={6} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {vehicles.filter(v => v.location?.lat && v.location?.lng).map(v => (
              <CircleMarker
                key={v.id}
                center={[v.location.lat, v.location.lng]}
                radius={9}
                pathOptions={{ color: '#fff', weight: 2, fillColor: STATUS_COLOR[v.status] || '#64748b', fillOpacity: 0.9 }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">{v.regNumber}</div>
                    <div className="text-slate-500">{v.make} {v.model}</div>
                    <div className="mt-1">Status: <span className="font-medium">{v.status}</span></div>
                    <div>Speed: <span className="font-medium">{v.speed} km/h</span></div>
                    <div className="text-xs text-slate-400 mt-1">{fmtTime(lastPing[v.id] || null)}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Vehicle positions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Vehicle', 'Reg. Number', 'Status', 'Speed', 'Last Signal'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vehicles.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{v.id} <span className="text-slate-400 font-normal">· {v.make} {v.model}</span></td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600">{v.regNumber}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[v.status] || '#94a3b8' }} />
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{v.speed} km/h</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtTime(lastPing[v.id] || null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
