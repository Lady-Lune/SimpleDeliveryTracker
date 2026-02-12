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
  status: 'Not Delivered' | 'Next' | 'Delivered';
}

// Result type for coordinate parsing - includes error type for viewport-only links
type ParseResult = 
  | { success: true; lat: number; lng: number }
  | { success: false; error: 'no_coordinates' | 'viewport_only' };

// Validate that coordinates are within valid ranges
function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

// Convert DMS (Degrees, Minutes, Seconds) to decimal degrees
// Example input: degrees=6, minutes=42, seconds=11.4, direction='N'
function dmsToDecimal(degrees: number, minutes: number, seconds: number, direction: string): number {
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  return decimal;
}

// Try to parse DMS coordinates from a URL-encoded place name
// Example: "6%C2%B042'11.4%22N+80%C2%B047'13.6%22E" or "6°42'11.4"N+80°47'13.6"E"
function parseDMSFromPlaceName(url: string): { lat: number; lng: number } | null {
  try {
    // URL decode first
    const decoded = decodeURIComponent(url);
    
    // Match DMS pattern: degrees°minutes'seconds"direction
    // Supports various encodings of degree (°), minute ('), second (")
    // Pattern: NUMBER°NUMBER'NUMBER"[NSEW]
    const dmsPattern = /(\d+)[°](\d+)[''′](\d+\.?\d*)["""″]([NS])\s*[+\s]*(\d+)[°](\d+)[''′](\d+\.?\d*)["""″]([EW])/i;
    
    const match = decoded.match(dmsPattern);
    if (match) {
      const lat = dmsToDecimal(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3]),
        match[4].toUpperCase()
      );
      const lng = dmsToDecimal(
        parseFloat(match[5]),
        parseFloat(match[6]),
        parseFloat(match[7]),
        match[8].toUpperCase()
      );
      
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// Try to parse decimal coordinates from a place name in the URL
// Example: "/place/6.7031,80.7871/" or "/place/6.7031,80.7871@"
function parseDecimalFromPlaceName(url: string): { lat: number; lng: number } | null {
  try {
    // Match /place/LAT,LNG pattern (must be followed by / or @)
    const placeDecimalPattern = /\/place\/(-?\d+\.?\d*),(-?\d+\.?\d*)(?:\/|@|$)/;
    
    const match = url.match(placeDecimalPattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// Try to parse coordinates from Google Maps data parameter
// Format: data=...!3dLAT!4dLNG... (these are precise marker coordinates)
function parseFromDataParameter(url: string): { lat: number; lng: number } | null {
  try {
    // Match !3d (latitude) and !4d (longitude) in the data parameter
    const latMatch = url.match(/!3d(-?\d+\.?\d*)/);
    const lngMatch = url.match(/!4d(-?\d+\.?\d*)/);
    
    if (latMatch && lngMatch) {
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lngMatch[1]);
      
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// Parse coordinates from various Google Maps link formats
// Uses waterfall strategy: most precise methods first, viewport as detection only
export function parseCoordinates(mapLink: string): ParseResult {
  if (!mapLink) return { success: false, error: 'no_coordinates' };

  try {
    // STEP 1: Try q=LAT,LNG parameter (explicit search - MOST PRECISE)
    const qMatch = mapLink.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      const lat = parseFloat(qMatch[1]);
      const lng = parseFloat(qMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return { success: true, lat, lng };
      }
    }

    // STEP 2: Try ll=LAT,LNG parameter (explicit lat/lng - VERY PRECISE)
    const llMatch = mapLink.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
      const lat = parseFloat(llMatch[1]);
      const lng = parseFloat(llMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return { success: true, lat, lng };
      }
    }

    // STEP 3: Try !3d/!4d in data parameter (marker coordinates - VERY PRECISE)
    // Format: data=...!3dLAT!4dLNG... (used with Plus Codes and other place types)
    const dataCoords = parseFromDataParameter(mapLink);
    if (dataCoords) {
      return { success: true, ...dataCoords };
    }

    // STEP 4: Try DMS coordinates in /place/ name (dropped pins - VERY PRECISE)
    const dmsCoords = parseDMSFromPlaceName(mapLink);
    if (dmsCoords) {
      return { success: true, ...dmsCoords };
    }

    // STEP 5: Try decimal coordinates in /place/ name (dropped pins - VERY PRECISE)
    const decimalCoords = parseDecimalFromPlaceName(mapLink);
    if (decimalCoords) {
      return { success: true, ...decimalCoords };
    }

    // STEP 6: Check if URL has @LAT,LNG (viewport center - IMPRECISE)
    // We detect it but return an error since it's not reliable
    const atMatch = mapLink.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        // URL has coordinates but only viewport - not precise enough
        return { success: false, error: 'viewport_only' };
      }
    }

    // No coordinates found at all
    return { success: false, error: 'no_coordinates' };
  } catch {
    console.error('Error parsing coordinates from:', mapLink);
    return { success: false, error: 'no_coordinates' };
  }
}

// Legacy wrapper that returns just coordinates or null (for backwards compatibility)
export function parseCoordinatesSimple(mapLink: string): { lat: number; lng: number } | null {
  const result = parseCoordinates(mapLink);
  if (result.success) {
    return { lat: result.lat, lng: result.lng };
  }
  return null;
}

// Get error message for sheet based on parse result
export function getParseErrorMessage(result: ParseResult): string {
  if (result.success) return '';
  return result.error === 'viewport_only' ? 'viewport link error' : 'error';
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
// Returns the full ParseResult to distinguish viewport-only from no-coordinates errors
async function parseCoordinatesAsync(mapLink: string): Promise<ParseResult> {
  if (!mapLink) return { success: false, error: 'no_coordinates' };

  let urlToParse = mapLink;

  // If it's a short link, resolve it first
  if (isShortLink(mapLink)) {
    const resolvedUrl = await resolveShortLink(mapLink);
    if (resolvedUrl) {
      urlToParse = resolvedUrl;
    } else {
      // Couldn't resolve short link
      return { success: false, error: 'no_coordinates' };
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

    if (latFromSheet && lngFromSheet && latFromSheet !== 'error' && lngFromSheet !== 'error' && latFromSheet !== 'viewport link error' && lngFromSheet !== 'viewport link error') {
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
        const parseResult = parseCoordinates(googleMapLink);
        if (parseResult.success) {
          coordinates = { lat: parseResult.lat, lng: parseResult.lng };
          // Mark for update if sheet cells are empty
          if (!latFromSheet && !lngFromSheet) {
            rowsNeedingCoordinates.push({
              rowIndex: actualRowIndex,
              lat: parseResult.lat.toString(),
              lng: parseResult.lng.toString(),
            });
          }
        } else if (!latFromSheet && !lngFromSheet) {
          // Parsing failed and cells are empty - mark with appropriate error
          const errorMsg = getParseErrorMessage(parseResult);
          rowsNeedingCoordinates.push({
            rowIndex: actualRowIndex,
            lat: errorMsg,
            lng: errorMsg,
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
        status: (row[9] as Recipient['status']) || 'Not Delivered',
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
        const parseResult = await parseCoordinatesAsync(pending.recipient.googleMapLink);
        return { pending, parseResult };
      })
    );

    // Update recipients and track sheet updates
    for (const { pending, parseResult } of resolutions) {
      if (parseResult.success) {
        pending.recipient.coordinates = { lat: parseResult.lat, lng: parseResult.lng };
        rowsNeedingCoordinates.push({
          rowIndex: pending.actualRowIndex,
          lat: parseResult.lat.toString(),
          lng: parseResult.lng.toString(),
        });
      } else {
        // Resolution failed - mark with appropriate error
        const errorMsg = getParseErrorMessage(parseResult);
        rowsNeedingCoordinates.push({
          rowIndex: pending.actualRowIndex,
          lat: errorMsg,
          lng: errorMsg,
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
  status: 'Not Delivered' | 'Next' | 'Delivered'
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

// Log delivery location to Sheet2 (audit trail)
export async function logDelivery(
  id: string,
  lat: number | string,
  lng: number | string
): Promise<boolean> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  try {
    const timestamp = new Date().toISOString();

    // Append a new row to Sheet2
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet2!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[id, lat.toString(), lng.toString(), timestamp]],
      },
    });

    return true;
  } catch (error) {
    console.error('Error logging delivery:', error);
    return false;
  }
}

// Get recent deliveries from Sheet2 (for public live page)
export async function getRecentDeliveries(count: number = 3): Promise<{
  lat: number;
  lng: number;
  time: string;
}[]> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet2!A:D',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return [];
    }

    // Skip header, get all data rows, reverse to get most recent first
    const dataRows = rows.slice(1).reverse();

    // Take the last N deliveries
    const recentRows = dataRows.slice(0, count);

    return recentRows
      .filter((row) => {
        // Must have lat/lng and they must be valid numbers (not "error")
        if (!row[1] || !row[2]) return false;
        const lat = parseFloat(row[1]);
        const lng = parseFloat(row[2]);
        return !isNaN(lat) && !isNaN(lng);
      })
      .map((row) => ({
        lat: parseFloat(row[1]),
        lng: parseFloat(row[2]),
        time: row[3] || '',
      }));
  } catch (error) {
    console.error('Error fetching recent deliveries:', error);
    return [];
  }
}

// Get delivery stats from Sheet1 (for public live page)
export async function getDeliveryStats(): Promise<{
  delivered: number;
  total: number;
}> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  try {
    // Fetch just the Status column (J) and ID column (A) to count
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:J',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return { delivered: 0, total: 0 };
    }

    // Skip header, count rows with valid ID
    const dataRows = rows.slice(1).filter((row) => row[0]); // Must have ID
    const total = dataRows.length;
    const delivered = dataRows.filter((row) => row[9] === 'Delivered').length;

    return { delivered, total };
  } catch (error) {
    console.error('Error fetching delivery stats:', error);
    return { delivered: 0, total: 0 };
  }
}

// Reset all deliveries for a new day:
// 1. Set all "Delivered" statuses back to "Not Delivered" in Sheet1
// 2. Clear all data rows in Sheet2 (keep header)
export async function resetDeliveries(): Promise<boolean> {
  const sheets = await getAuthenticatedClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured');
  }

  try {
    // Step 1: Get all rows from Sheet1 to find delivered ones
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:J',
    });

    const rows = response.data.values;
    if (rows && rows.length > 1) {
      // Build batch update for all rows that are "Delivered"
      const updates: { range: string; values: string[][] }[] = [];
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] && row[9] === 'Delivered') {
          // Row index in sheet is i + 1 (1-based, and we skipped header check with i starting at 1)
          updates.push({
            range: `Sheet1!J${i + 1}`,
            values: [['Not Delivered']],
          });
        }
      }

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updates,
          },
        });
      }
    }

    // Step 2: Clear Sheet2 data (keep header row)
    // First check if Sheet2 has data
    const sheet2Response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet2!A:D',
    });

    const sheet2Rows = sheet2Response.data.values;
    if (sheet2Rows && sheet2Rows.length > 1) {
      // Clear from row 2 onwards
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `Sheet2!A2:D${sheet2Rows.length}`,
      });
    }

    return true;
  } catch (error) {
    console.error('Error resetting deliveries:', error);
    return false;
  }
}
