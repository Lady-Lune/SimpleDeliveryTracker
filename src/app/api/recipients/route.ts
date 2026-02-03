import { NextRequest, NextResponse } from 'next/server';
import { getRecipients, updateDeliveryStatus, logDelivery, resetDeliveries } from '@/lib/googleSheets';

// Get all valid access codes from environment
function getValidAccessCodes(): string[] {
  // Support both ACCESS_CODES (comma-separated list) and legacy ADMIN_ACCESS_CODE
  const codesList = process.env.ACCESS_CODES;
  const legacyCode = process.env.ADMIN_ACCESS_CODE;

  const codes: string[] = [];

  if (codesList) {
    codes.push(...codesList.split(',').map((c) => c.trim()).filter(Boolean));
  }

  if (legacyCode && !codes.includes(legacyCode)) {
    codes.push(legacyCode);
  }

  return codes;
}

// Verify the admin access code
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  const validCodes = getValidAccessCodes();

  if (!authHeader || validCodes.length === 0) {
    return false;
  }

  // Expected format: "Bearer <code>"
  const token = authHeader.replace('Bearer ', '');
  return validCodes.includes(token);
}

// GET /api/recipients - Fetch all recipients
export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const recipients = await getRecipients();
    return NextResponse.json({ recipients });
  } catch (error) {
    console.error('Error fetching recipients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recipients' },
      { status: 500 }
    );
  }
}

// PATCH /api/recipients - Update delivery status
export async function PATCH(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { id, status, deliveryLocation } = body;

    // Validate id: must be a non-empty string
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid id (must be a string)' },
        { status: 400 }
      );
    }

    // Validate status: must be a string and one of the valid statuses
    if (!status || typeof status !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid status' },
        { status: 400 }
      );
    }

    const validStatuses = ['Not Delivered', 'Next', 'Delivered'] as const;
    if (!validStatuses.includes(status as typeof validStatuses[number])) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: Not Delivered, Next, or Delivered' },
        { status: 400 }
      );
    }

    const success = await updateDeliveryStatus(id, status as 'Not Delivered' | 'Next' | 'Delivered');

    if (success) {
      // Log delivery location to Sheet2 if status is Delivered
      if (status === 'Delivered' && deliveryLocation !== undefined) {
        // Check if location was captured or if it's an error (null values)
        const lat = deliveryLocation.lat !== null ? deliveryLocation.lat : 'error';
        const lng = deliveryLocation.lng !== null ? deliveryLocation.lng : 'error';
        
        // Fire and forget - don't block the response
        logDelivery(id, lat, lng).catch((err) => {
          console.error('Error logging delivery location:', err);
        });
      }

      return NextResponse.json({ success: true, id, status });
    } else {
      return NextResponse.json(
        { error: 'Failed to update status. Recipient not found.' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

// DELETE /api/recipients - Reset all deliveries for a new day
export async function DELETE(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const success = await resetDeliveries();

    if (success) {
      return NextResponse.json({ success: true, message: 'All deliveries reset for new day' });
    } else {
      return NextResponse.json(
        { error: 'Failed to reset deliveries' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error resetting deliveries:', error);
    return NextResponse.json(
      { error: 'Failed to reset deliveries' },
      { status: 500 }
    );
  }
}
