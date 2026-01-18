'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Recipient } from '@/lib/googleSheets';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Color-coded icons for different statuses using inline SVG data URIs
const createColoredIcon = (color: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="3"/>
    </svg>
  `;
  const svgUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
  
  return L.icon({
    iconUrl: svgUrl,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

const statusIcons = {
  Pending: createColoredIcon('#ef4444'),
  'On the way': createColoredIcon('#eab308'),
  Delivered: createColoredIcon('#22c55e'),
};

// Locate Me button component
function LocateControl() {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    setLocating(true);
    map.locate({ setView: true, maxZoom: 16 });
  };

  useEffect(() => {
    const onLocationFound = () => setLocating(false);
    const onLocationError = () => {
      setLocating(false);
      alert('Could not get your location');
    };

    map.on('locationfound', onLocationFound);
    map.on('locationerror', onLocationError);

    return () => {
      map.off('locationfound', onLocationFound);
      map.off('locationerror', onLocationError);
    };
  }, [map]);

  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '20px', marginRight: '10px' }}>
      <div className="leaflet-control">
        <button
          onClick={handleLocate}
          disabled={locating}
          style={{
            padding: '8px 16px',
            backgroundColor: 'white',
            border: '2px solid rgba(0,0,0,0.2)',
            borderRadius: '4px',
            cursor: locating ? 'wait' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {locating ? 'Locating...' : '📍 Locate Me'}
        </button>
      </div>
    </div>
  );
}

interface MapComponentProps {
  recipients: Recipient[];
  onStatusUpdate: (id: string, status: 'Pending' | 'On the way' | 'Delivered') => void;
}

export default function MapComponent({ recipients, onStatusUpdate }: MapComponentProps) {
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

  // Calculate center from recipients or use default
  const validRecipients = recipients.filter((r) => r.coordinates);
  const defaultCenter: [number, number] = validRecipients.length > 0
    ? [validRecipients[0].coordinates!.lat, validRecipients[0].coordinates!.lng]
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
      
      <LocateControl />

      {validRecipients.map((recipient) => (
        <Marker
          key={recipient.id}
          position={[recipient.coordinates!.lat, recipient.coordinates!.lng]}
          icon={statusIcons[recipient.status] || statusIcons.Pending}
        >
          <Popup>
            <div style={{ minWidth: '200px', padding: '4px' }}>
              {/* Recipient Type with color coding */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: recipient.recipientType.toLowerCase().includes('girl')
                      ? '#ec4899'
                      : '#3b82f6',
                  }}
                />
                <span style={{ fontWeight: 600, color: '#1f2937' }}>
                  {recipient.recipientType}
                </span>
              </div>

              {/* Faculty */}
              <div style={{ fontSize: '14px', color: '#4b5563', marginBottom: '8px' }}>
                📚 {recipient.faculty}
              </div>

              {/* Parcels - Large & Bold */}
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
                {recipient.parcels} <span style={{ fontSize: '14px', fontWeight: 400 }}>parcels</span>
              </div>

              {/* Phone - Click to call */}
              {recipient.phone && (
                <a
                  href={`tel:${recipient.phone}`}
                  style={{ display: 'block', color: '#2563eb', marginBottom: '4px' }}
                >
                  📞 {recipient.phone}
                </a>
              )}

              {/* Secondary Phone - Click to call */}
              {recipient.secondaryPhone && (
                <a
                  href={`tel:${recipient.secondaryPhone}`}
                  style={{ display: 'block', color: '#2563eb', marginBottom: '12px' }}
                >
                  📱 {recipient.secondaryPhone}
                </a>
              )}

              {/* Status Badge */}
              <div style={{ marginBottom: '12px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor:
                      recipient.status === 'Pending'
                        ? '#fef2f2'
                        : recipient.status === 'On the way'
                        ? '#fefce8'
                        : '#f0fdf4',
                    color:
                      recipient.status === 'Pending'
                        ? '#991b1b'
                        : recipient.status === 'On the way'
                        ? '#854d0e'
                        : '#166534',
                  }}
                >
                  {recipient.status}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {recipient.status !== 'On the way' && (
                  <button
                    onClick={() => onStatusUpdate(recipient.id, 'On the way')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#eab308',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 500,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    In Progress
                  </button>
                )}
                {recipient.status !== 'Delivered' && (
                  <button
                    onClick={() => onStatusUpdate(recipient.id, 'Delivered')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 500,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Delivered
                  </button>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
