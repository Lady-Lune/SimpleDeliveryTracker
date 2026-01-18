import { NextRequest, NextResponse } from 'next/server';
import { getRecipients, updateDeliveryStatus } from '@/lib/googleSheets';

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
    const { id, status } = body;

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

    const validStatuses = ['Pending', 'On the way', 'Delivered'] as const;
    if (!validStatuses.includes(status as typeof validStatuses[number])) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: Pending, On the way, or Delivered' },
        { status: 400 }
      );
    }

    const success = await updateDeliveryStatus(id, status as 'Pending' | 'On the way' | 'Delivered');

    if (success) {
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
