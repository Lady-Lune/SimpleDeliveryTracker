import { google } from 'googleapis';

// Types for recipients
// Sheet columns: A=ID, B=GoogleMapLink, C=Latitude, D=Longitude, E=RecipientType, F=Parcels, G=Faculty, H=Phone, I=SecondaryPhone, J=Status
export interface Recipient {
  id: string; // Unique identifier from column A
  googleMapLink: string;
  coordinates: { lat: number; lng: number } | null;
  recipientType: string;
  parcels: number;
  faculty: string;
  phone: string;
  secondaryPhone: string;
  status: 'Pending' | 'On the way' | 'Delivered';
}

// Parse coordinates from various Google Maps link formats
export function parseCoordinates(mapLink: string): { lat: number; lng: number } | null {
  if (!mapLink) return null;

  try {
    // Format 1: https://www.google.com/maps?q=LAT,LNG
    // Format 2: https://www.google.com/maps/place/.../@LAT,LNG,...
    // Format 3: https://maps.google.com/?q=LAT,LNG
    // Note: Short links (goo.gl, maps.app.goo.gl) are handled separately via resolveShortLink()
    
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

// Check if a URL is a short link that needs resolution
function isShortLink(url: string): boolean {
  return /goo\.gl|maps\.app\.goo\.gl/i.test(url);
}

// Resolve a short link to its full URL by following redirects
async function resolveShortLink(shortUrl: string): Promise<string | null> {
  try {
    // Use fetch with redirect: 'manual' to get the Location header without following
    // This is more reliable than 'follow' which may not give us the intermediate URLs
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });
    
    // The final URL after all redirects
    return response.url;
  } catch (error) {
    console.error('Error resolving short link:', shortUrl, error);
    return null;
  }
}

// Parse coordinates from a link, resolving short links if needed
async function parseCoordinatesAsync(mapLink: string): Promise<{ lat: number; lng: number } | null> {
  if (!mapLink) return null;

  let urlToParse = mapLink;

  // If it's a short link, resolve it first
  if (isShortLink(mapLink)) {
    const resolvedUrl = await resolveShortLink(mapLink);
    if (resolvedUrl) {
      urlToParse = resolvedUrl;
    } else {
      // Couldn't resolve short link
      return null;
    }
  }

  // Now parse using the regular function
  return parseCoordinates(urlToParse);
}

// Format private key - handles both escaped \n and actual newlines
function formatPrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  
  // If the key contains literal \n (as two characters), replace with actual newlines
  // This handles keys pasted with escaped newlines
  let formatted = key.replace(/\\n/g, '\n');
  
  // Also handle double-escaped newlines (\\n becoming \n in some environments)
  formatted = formatted.replace(/\n/g, '\n');
  
  return formatted;
}

// Get authenticated Google Sheets client
async function getAuthenticatedClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Fetch all recipients from the Google Sheet
// Sheet columns: A=ID, B=GoogleMapLink, C=Latitude, D=Longitude, E=RecipientType, F=Parcels, G=Faculty, H=Phone, I=SecondaryPhone, J=Status
export async function getRecipients(): Promise<Recipient[]> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:J', // Columns A through J
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // Track rows that need lat/lng updates
  const rowsNeedingCoordinates: { rowIndex: number; lat: string; lng: string }[] = [];

  // First pass: build recipient objects and identify rows needing coordinate resolution
  interface PendingRecipient {
    recipient: Recipient;
    actualRowIndex: number;
    needsShortLinkResolution: boolean;
    latFromSheet: string;
    lngFromSheet: string;
  }

  const pendingRecipients: PendingRecipient[] = [];

  // Skip header row (index 0)
  for (let index = 0; index < rows.length - 1; index++) {
    const row = rows[index + 1]; // +1 to skip header
    const actualRowIndex = index + 2; // +2 for header and 1-based indexing
    const id = row[0] || '';
    const googleMapLink = row[1] || '';
    const latFromSheet = row[2] || '';
    const lngFromSheet = row[3] || '';

    // Skip rows without an ID
    if (!id) continue;

    // Determine coordinates: use sheet values if valid numbers
    let coordinates: { lat: number; lng: number } | null = null;
    let needsShortLinkResolution = false;

    if (latFromSheet && lngFromSheet && latFromSheet !== 'error' && lngFromSheet !== 'error') {
      // Try to use existing lat/lng from sheet
      const lat = parseFloat(latFromSheet);
      const lng = parseFloat(lngFromSheet);
      if (!isNaN(lat) && !isNaN(lng)) {
        coordinates = { lat, lng };
      }
    }

    // If no valid coordinates from sheet, try to parse from link
    if (!coordinates && googleMapLink) {
      // Check if it's a short link that needs async resolution
      if (isShortLink(googleMapLink) && !latFromSheet && !lngFromSheet) {
        needsShortLinkResolution = true;
      } else {
        // Try synchronous parsing for regular links
        const parsed = parseCoordinates(googleMapLink);
        if (parsed) {
          coordinates = parsed;
          // Mark for update if sheet cells are empty
          if (!latFromSheet && !lngFromSheet) {
            rowsNeedingCoordinates.push({
              rowIndex: actualRowIndex,
              lat: parsed.lat.toString(),
              lng: parsed.lng.toString(),
            });
          }
        } else if (!latFromSheet && !lngFromSheet) {
          // Parsing failed and cells are empty - mark as error
          rowsNeedingCoordinates.push({
            rowIndex: actualRowIndex,
            lat: 'error',
            lng: 'error',
          });
        }
      }
    }

    pendingRecipients.push({
      recipient: {
        id,
        googleMapLink,
        coordinates,
        recipientType: row[4] || '',
        parcels: parseInt(row[5], 10) || 0,
        faculty: row[6] || '',
        phone: row[7] || '',
        secondaryPhone: row[8] || '',
        status: (row[9] as Recipient['status']) || 'Pending',
      },
      actualRowIndex,
      needsShortLinkResolution,
      latFromSheet,
      lngFromSheet,
    });
  }

  // Second pass: resolve short links in parallel
  const shortLinkRecipients = pendingRecipients.filter((p) => p.needsShortLinkResolution);
  
  if (shortLinkRecipients.length > 0) {
    const resolutions = await Promise.all(
      shortLinkRecipients.map(async (pending) => {
        const coords = await parseCoordinatesAsync(pending.recipient.googleMapLink);
        return { pending, coords };
      })
    );

    // Update recipients and track sheet updates
    for (const { pending, coords } of resolutions) {
      if (coords) {
        pending.recipient.coordinates = coords;
        rowsNeedingCoordinates.push({
          rowIndex: pending.actualRowIndex,
          lat: coords.lat.toString(),
          lng: coords.lng.toString(),
        });
      } else {
        // Resolution failed - mark as error
        rowsNeedingCoordinates.push({
          rowIndex: pending.actualRowIndex,
          lat: 'error',
          lng: 'error',
        });
      }
    }
  }

  // Update sheet with parsed coordinates (async, don't await - fire and forget)
  if (rowsNeedingCoordinates.length > 0) {
    updateCoordinatesInSheet(sheets, sheetId, rowsNeedingCoordinates).catch((err) => {
      console.error('Error updating coordinates in sheet:', err);
    });
  }

  return pendingRecipients.map((p) => p.recipient);
}

// Update latitude and longitude columns in the sheet
async function updateCoordinatesInSheet(
  sheets: Awaited<ReturnType<typeof getAuthenticatedClient>>,
  sheetId: string,
  updates: { rowIndex: number; lat: string; lng: string }[]
): Promise<void> {
  // Batch update all coordinates
  const data = updates.map(({ rowIndex, lat, lng }) => ({
    range: `Sheet1!C${rowIndex}:D${rowIndex}`,
    values: [[lat, lng]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

// Update the delivery status for a specific recipient by ID (column A)
export async function updateDeliveryStatus(
  id: string,
  status: 'Pending' | 'On the way' | 'Delivered'
): Promise<boolean> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  try {
    // Fetch ID column only to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return false;
    }

    // Find the row with matching ID in column A (skip header at index 0)
    let targetRowIndex: number | null = null;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowId = row[0] || ''; // ID is in column A (index 0)

      if (rowId === id) {
        targetRowIndex = i + 1; // +1 because Sheets uses 1-based indexing
        break;
      }
    }

    if (targetRowIndex === null) {
      console.error('Recipient not found with ID:', id);
      return false;
    }

    // Update the status column for the found row (column J)
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Sheet1!J${targetRowIndex}`, // Status is in column J
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
