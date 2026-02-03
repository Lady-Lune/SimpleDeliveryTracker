'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Create numbered icons for recent deliveries
const createNumberedIcon = (number: number) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
      <circle cx="20" cy="20" r="18" fill="#22c55e" stroke="white" stroke-width="3"/>
      <text x="20" y="26" font-size="18" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">${number}</text>
    </svg>
  `;
  const svgUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
  
  return L.icon({
    iconUrl: svgUrl,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

// Format relative time (e.g., "5 min ago")
function formatTimeAgo(isoString: string): string {
  if (!isoString) return 'Recently';
  
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} min ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    return date.toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

interface RecentDelivery {
  lat: number;
  lng: number;
  time: string;
}

interface LiveMapComponentProps {
  recentDeliveries: RecentDelivery[];
}

export default function LiveMapComponent({ recentDeliveries }: LiveMapComponentProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-800">
        <div className="text-white">Loading map...</div>
      </div>
    );
  }

  // Filter out any deliveries with invalid coordinates (NaN)
  const validDeliveries = recentDeliveries.filter(
    (d) => !isNaN(d.lat) && !isNaN(d.lng) && d.lat !== null && d.lng !== null
  );

  // Calculate center from deliveries or use default
  const defaultCenter: [number, number] = validDeliveries.length > 0
    ? [validDeliveries[0].lat, validDeliveries[0].lng]
    : [0, 0];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {validDeliveries.map((delivery, index) => (
        <Marker
          key={`${delivery.lat}-${delivery.lng}-${index}`}
          position={[delivery.lat, delivery.lng]}
          icon={createNumberedIcon(validDeliveries.length - index)}
        >
          <Popup>
            <div style={{ textAlign: 'center', padding: '4px' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#22c55e', marginBottom: '4px' }}>
                ✓ Delivered
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                {formatTimeAgo(delivery.time)}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
