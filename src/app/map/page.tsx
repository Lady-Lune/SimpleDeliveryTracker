'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Recipient } from '@/lib/googleSheets';

// Dynamic import to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-zinc-800">
      <div className="text-white">Loading map...</div>
    </div>
  ),
});

type StatusFilter = 'all' | 'Pending' | 'On the way' | 'Delivered';

export default function MapPage() {
  const router = useRouter();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminCode, setAdminCode] = useState<string | null>(null);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [facultyFilter, setFacultyFilter] = useState<string>('all');
  const [hideDelivered, setHideDelivered] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const code = localStorage.getItem('adminCode');
    if (!code) {
      router.push('/');
      return;
    }
    setAdminCode(code);
  }, [router]);

  // Fetch recipients
  const fetchRecipients = useCallback(async () => {
    if (!adminCode) return;

    try {
      const response = await fetch('/api/recipients', {
        headers: {
          Authorization: `Bearer ${adminCode}`,
        },
      });

      if (response.status === 401) {
        localStorage.removeItem('adminCode');
        router.push('/');
        return;
      }

      const data = await response.json();
      if (data.recipients) {
        setRecipients(data.recipients);
      }
    } catch {
      setError('Failed to load recipients');
    } finally {
      setLoading(false);
    }
  }, [adminCode, router]);

  useEffect(() => {
    if (adminCode) {
      fetchRecipients();
    }
  }, [adminCode, fetchRecipients]);

  // Calculate stats (must be before any early returns to maintain hook order)
  const totalRecipients = recipients.length;
  const deliveredCount = recipients.filter((r) => r.status === 'Delivered').length;
  const inProgressCount = recipients.filter((r) => r.status === 'On the way').length;

  // Get unique faculties for filter dropdown (must be before any early returns)
  const faculties = useMemo(() => {
    const uniqueFaculties = [...new Set(recipients.map((r) => r.faculty).filter(Boolean))];
    return uniqueFaculties.sort();
  }, [recipients]);

  // Filter recipients (must be before any early returns)
  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // Hide delivered filter
      if (hideDelivered && r.status === 'Delivered') return false;
      
      // Status filter
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      
      // Faculty filter
      if (facultyFilter !== 'all' && r.faculty !== facultyFilter) return false;
      
      return true;
    });
  }, [recipients, statusFilter, facultyFilter, hideDelivered]);

  // Handle status update (optimistic UI)
  const handleStatusUpdate = async (
    id: string,
    status: 'Pending' | 'On the way' | 'Delivered'
  ) => {
    if (!adminCode) return;

    // Optimistic update
    setRecipients((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status } : r
      )
    );

    try {
      const response = await fetch('/api/recipients', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminCode}`,
        },
        body: JSON.stringify({ id, status }),
      });

      if (!response.ok) {
        // Revert on failure
        fetchRecipients();
      }
    } catch {
      // Revert on error
      fetchRecipients();
    }
  };

  // Logout function
  const handleLogout = () => {
    localStorage.removeItem('adminCode');
    router.push('/');
  };

  if (!adminCode || loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-900 gap-4">
        <div className="text-red-400 text-xl">{error}</div>
        <button
          onClick={fetchRecipients}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between z-10">
        <h1 className="text-lg font-bold">Delivery Coordinator</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Logout
        </button>
      </header>

      {/* Stats Dashboard */}
      <div className="bg-zinc-800 text-white px-4 py-2 flex gap-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          {deliveredCount}/{totalRecipients} Delivered
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
          {inProgressCount} In Progress
        </span>
      </div>

      {/* Filter Controls */}
      <div className="bg-zinc-700 text-white px-4 py-2 flex flex-wrap gap-3 text-sm items-center">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-zinc-300">Status:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-zinc-600 border border-zinc-500 rounded px-2 py-1 text-white text-sm"
          >
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="On the way">On the way</option>
            <option value="Delivered">Delivered</option>
          </select>
        </div>

        {/* Faculty Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="faculty-filter" className="text-zinc-300">Faculty:</label>
          <select
            id="faculty-filter"
            value={facultyFilter}
            onChange={(e) => setFacultyFilter(e.target.value)}
            className="bg-zinc-600 border border-zinc-500 rounded px-2 py-1 text-white text-sm"
          >
            <option value="all">All</option>
            {faculties.map((faculty) => (
              <option key={faculty} value={faculty}>
                {faculty}
              </option>
            ))}
          </select>
        </div>

        {/* Hide Delivered Toggle */}
        <label className="flex items-center gap-2 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={hideDelivered}
            onChange={(e) => setHideDelivered(e.target.checked)}
            className="w-4 h-4 accent-green-500"
          />
          <span className="text-zinc-300">Hide delivered</span>
        </label>
      </div>

      {/* Map */}
      <main className="flex-1">
        <MapComponent
          recipients={filteredRecipients}
          onStatusUpdate={handleStatusUpdate}
        />
      </main>
    </div>
  );
}
