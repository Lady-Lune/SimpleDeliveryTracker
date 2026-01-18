import { google } from 'googleapis';

// Types for recipients
export interface Recipient {
  rowIndex: number;
  googleMapLink: string;
  coordinates: { lat: number; lng: number } | null;
  recipientType: string;
  parcels: number;
  faculty: string;
  phone: string;
  status: 'Pending' | 'On the way' | 'Delivered';
}

// Parse coordinates from various Google Maps link formats
export function parseCoordinates(mapLink: string): { lat: number; lng: number } | null {
  if (!mapLink) return null;

  try {
    // Format 1: https://www.google.com/maps?q=LAT,LNG
    // Format 2: https://www.google.com/maps/place/.../@LAT,LNG,...
    // Format 3: https://maps.google.com/?q=LAT,LNG
    // Format 4: https://goo.gl/maps/... (short links - need to handle separately)
    
    // Try to extract from @LAT,LNG format (common in place URLs)
    const atMatch = mapLink.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      return {
        lat: parseFloat(atMatch[1]),
        lng: parseFloat(atMatch[2]),
      };
    }

    // Try to extract from q=LAT,LNG format
    const qMatch = mapLink.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      return {
        lat: parseFloat(qMatch[1]),
        lng: parseFloat(qMatch[2]),
      };
    }

    // Try to extract from ll=LAT,LNG format
    const llMatch = mapLink.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
      return {
        lat: parseFloat(llMatch[1]),
        lng: parseFloat(llMatch[2]),
      };
    }

    // Try to extract plain coordinates (LAT,LNG anywhere in the URL path)
    const plainMatch = mapLink.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (plainMatch) {
      return {
        lat: parseFloat(plainMatch[1]),
        lng: parseFloat(plainMatch[2]),
      };
    }

    return null;
  } catch {
    console.error('Error parsing coordinates from:', mapLink);
    return null;
  }
}

// Get authenticated Google Sheets client
async function getAuthenticatedClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Fetch all recipients from the Google Sheet
export async function getRecipients(): Promise<Recipient[]> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:F', // Adjust if your sheet has a different name
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // Skip header row (index 0)
  const recipients: Recipient[] = rows.slice(1).map((row, index) => {
    const googleMapLink = row[0] || '';
    return {
      rowIndex: index + 2, // +2 because: +1 for 0-indexing, +1 for header row
      googleMapLink,
      coordinates: parseCoordinates(googleMapLink),
      recipientType: row[1] || '',
      parcels: parseInt(row[2], 10) || 0,
      faculty: row[3] || '',
      phone: row[4] || '',
      status: (row[5] as Recipient['status']) || 'Pending',
    };
  });

  return recipients;
}

// Update the delivery status for a specific recipient
export async function updateDeliveryStatus(
  rowIndex: number,
  status: 'Pending' | 'On the way' | 'Delivered'
): Promise<boolean> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Sheet1!F${rowIndex}`, // Status is in column F
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status]],
      },
    });

    return true;
  } catch (error) {
    console.error('Error updating delivery status:', error);
    return false;
  }
}
