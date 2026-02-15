'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Recipient } from '@/lib/googleSheets';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Type for grouping recipients at the same location
export interface LocationGroup {
  coordinates: { lat: number; lng: number };
  recipients: Recipient[];
}

// Coordinate tolerance for grouping (approx 10 meters)
const COORDINATE_TOLERANCE = 0.0001;

// Utility function to group recipients by location
function groupRecipientsByLocation(recipients: Recipient[]): LocationGroup[] {
  const groups: LocationGroup[] = [];
  
  for (const recipient of recipients) {
    if (!recipient.coordinates) continue;
    
    // Find existing group within tolerance
    const existingGroup = groups.find((group) => {
      const latDiff = Math.abs(group.coordinates.lat - recipient.coordinates!.lat);
      const lngDiff = Math.abs(group.coordinates.lng - recipient.coordinates!.lng);
      return latDiff <= COORDINATE_TOLERANCE && lngDiff <= COORDINATE_TOLERANCE;
    });
    
    if (existingGroup) {
      existingGroup.recipients.push(recipient);
    } else {
      groups.push({
        coordinates: { lat: recipient.coordinates.lat, lng: recipient.coordinates.lng },
        recipients: [recipient],
      });
    }
  }
  
  return groups;
}

// Color-coded icons for different statuses using inline SVG data URIs
const createColoredIcon = (color: string, count?: number) => {
  // If count > 1, show a badge with the count
  const badge = count && count > 1 
    ? `<text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="sans-serif">${count}</text>`
    : '';
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="3"/>
      ${badge}
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

// Helper to determine group status color (priority: red > yellow > green)
function getGroupStatusColor(recipients: Recipient[]): string {
  const hasNotDelivered = recipients.some((r) => r.status === 'Not Delivered');
  const hasNext = recipients.some((r) => r.status === 'Next');
  
  if (hasNotDelivered) return '#ef4444'; // Red
  if (hasNext) return '#eab308'; // Yellow
  return '#22c55e'; // Green (all delivered)
}

// Helper to get group status for display
function getGroupStatus(recipients: Recipient[]): 'Not Delivered' | 'Next' | 'Delivered' {
  const hasNotDelivered = recipients.some((r) => r.status === 'Not Delivered');
  const hasNext = recipients.some((r) => r.status === 'Next');
  
  if (hasNotDelivered) return 'Not Delivered';
  if (hasNext) return 'Next';
  return 'Delivered';
}

const statusIcons = {
  'Not Delivered': createColoredIcon('#ef4444'),
  'Next': createColoredIcon('#eab308'),
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
  onStatusUpdate: (id: string, status: 'Not Delivered' | 'Next' | 'Delivered', location?: { lat: number | null; lng: number | null }) => void;
}

export default function MapComponent({ recipients, onStatusUpdate }: MapComponentProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Group recipients by location (memoized for performance)
  const locationGroups = useMemo(() => {
    return groupRecipientsByLocation(recipients);
  }, [recipients]);

  if (!isClient) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-800">
        <div className="text-white">Loading map...</div>
      </div>
    );
  }

  // Calculate center from first group or use default
  const defaultCenter: [number, number] = locationGroups.length > 0
    ? [locationGroups[0].coordinates.lat, locationGroups[0].coordinates.lng]
    : [0, 0];

  // Helper to render a single recipient card (used in both single and multi views)
  const renderRecipientCard = (recipient: Recipient, isCompact: boolean = false) => (
    <div key={recipient.id} style={{ padding: isCompact ? '8px 0' : '4px' }}>
      {/* ID Badge */}
      <div style={{
        display: 'inline-block',
        padding: '2px 8px',
        marginBottom: '8px',
        backgroundColor: '#f3f4f6',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace',
        fontWeight: 600,
        color: '#374151',
      }}>
        #{recipient.id}
      </div>

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
        <span style={{ fontWeight: 600, color: '#1f2937', fontSize: isCompact ? '14px' : '16px' }}>
          {recipient.recipientType}
        </span>
        {isCompact && (
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            • {recipient.faculty}
          </span>
        )}
      </div>

      {/* Faculty (only in non-compact view) */}
      {!isCompact && (
        <div style={{ fontSize: '14px', color: '#4b5563', marginBottom: '8px' }}>
          📚 {recipient.faculty}
        </div>
      )}

      {/* Parcels */}
      <div style={{ fontSize: isCompact ? '20px' : '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
        {recipient.parcels} <span style={{ fontSize: '14px', fontWeight: 400 }}>parcels</span>
      </div>

      {/* Phone - Click to call */}
      {recipient.phone && (
        <a
          href={`tel:${recipient.phone}`}
          style={{ display: 'block', color: '#2563eb', marginBottom: '4px', fontSize: isCompact ? '13px' : '14px' }}
        >
          📞 {recipient.phone}
        </a>
      )}

      {/* Secondary Phone - Click to call */}
      {recipient.secondaryPhone && (
        <a
          href={`tel:${recipient.secondaryPhone}`}
          style={{ display: 'block', color: '#2563eb', marginBottom: isCompact ? '8px' : '12px', fontSize: isCompact ? '13px' : '14px' }}
        >
          📱 {recipient.secondaryPhone}
        </a>
      )}

      {/* Status Badge */}
      <div style={{ marginBottom: isCompact ? '8px' : '12px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            backgroundColor:
              recipient.status === 'Not Delivered'
                ? '#fef2f2'
                : recipient.status === 'Next'
                ? '#fefce8'
                : '#f0fdf4',
            color:
              recipient.status === 'Not Delivered'
                ? '#991b1b'
                : recipient.status === 'Next'
                ? '#854d0e'
                : '#166534',
          }}
        >
          {recipient.status}
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {recipient.status !== 'Next' && (
          <button
            onClick={() => onStatusUpdate(recipient.id, 'Next')}
            style={{
              flex: 1,
              padding: isCompact ? '6px 10px' : '8px 12px',
              backgroundColor: '#eab308',
              color: 'white',
              fontSize: isCompact ? '12px' : '14px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Next
          </button>
        )}
        {recipient.status !== 'Delivered' && (
          <button
            onClick={() => {
              // Capture GPS silently on delivery
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    onStatusUpdate(recipient.id, 'Delivered', {
                      lat: position.coords.latitude,
                      lng: position.coords.longitude,
                    });
                  },
                  () => {
                    // GPS failed, use recipient's coordinates as fallback
                    onStatusUpdate(recipient.id, 'Delivered', recipient.coordinates || undefined);
                  },
                  { timeout: 5000, enableHighAccuracy: true }
                );
              } else {
                // Geolocation not supported, use recipient's coordinates as fallback
                onStatusUpdate(recipient.id, 'Delivered', recipient.coordinates || undefined);
              }
            }}
            style={{
              flex: 1,
              padding: isCompact ? '6px 10px' : '8px 12px',
              backgroundColor: '#22c55e',
              color: 'white',
              fontSize: isCompact ? '12px' : '14px',
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
  );

  return (
    <MapContainer
      key="main-map"
      center={defaultCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <LocateControl />

      {locationGroups.map((group, index) => {
        const isSingleRecipient = group.recipients.length === 1;
        const groupColor = getGroupStatusColor(group.recipients);
        const groupIcon = createColoredIcon(groupColor, isSingleRecipient ? undefined : group.recipients.length);
        const totalParcels = group.recipients.reduce((sum, r) => sum + r.parcels, 0);

        return (
          <Marker
            key={`group-${index}-${group.coordinates.lat}-${group.coordinates.lng}`}
            position={[group.coordinates.lat, group.coordinates.lng]}
            icon={isSingleRecipient ? statusIcons[group.recipients[0].status] || statusIcons['Not Delivered'] : groupIcon}
          >
            <Popup>
              {isSingleRecipient ? (
                // Single recipient: use original layout
                <div style={{ minWidth: '200px', padding: '4px' }}>
                  {renderRecipientCard(group.recipients[0], false)}
                </div>
              ) : (
                // Multiple recipients: grouped layout
                <div style={{ minWidth: '240px', maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
                  {/* Group Header */}
                  <div style={{
                    padding: '8px',
                    marginBottom: '8px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    borderLeft: `4px solid ${groupColor}`,
                  }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '16px', marginBottom: '4px' }}>
                      📍 {group.recipients.length} recipients here
                    </div>
                    <div style={{ fontSize: '14px', color: '#4b5563' }}>
                      <strong>{totalParcels}</strong> total parcels
                    </div>
                  </div>

                  {/* Recipient Cards */}
                  {group.recipients.map((recipient, rIndex) => (
                    <div key={recipient.id}>
                      {rIndex > 0 && (
                        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
                      )}
                      {renderRecipientCard(recipient, true)}
                    </div>
                  ))}
                </div>
              )}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
