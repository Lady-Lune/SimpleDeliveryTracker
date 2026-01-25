'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Leaflet
const LiveMapComponent = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-zinc-800">
      <div className="text-white">Loading map...</div>
    </div>
  ),
});

interface RecentDelivery {
  lat: number;
  lng: number;
  time: string;
}

export default function LivePage() {
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  const [delivered, setDelivered] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/deliveries');
      const data = await response.json();

      if (data.recentDeliveries) {
        setRecentDeliveries(data.recentDeliveries);
      }
      setDelivered(data.delivered || 0);
      setTotal(data.total || 0);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between z-10">
        <h1 className="text-lg font-bold">🚚 Live Deliveries</h1>
        {lastUpdated && (
          <span className="text-xs text-zinc-400">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </header>

      {/* Stats Banner */}
      <div className="bg-zinc-800 text-white px-4 py-3 flex items-center justify-center gap-2">
        <span className="text-3xl font-bold text-green-400">{delivered}</span>
        <span className="text-zinc-400">/</span>
        <span className="text-xl text-zinc-300">{total}</span>
        <span className="text-zinc-400 ml-2">Delivered</span>
      </div>

      {/* Map */}
      <main className="flex-1">
        <LiveMapComponent recentDeliveries={recentDeliveries} />
      </main>

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-500 text-xs px-4 py-2 text-center">
        Auto-refreshes every 30 seconds • Showing last 3 delivery locations
      </footer>
    </div>
  );
}
