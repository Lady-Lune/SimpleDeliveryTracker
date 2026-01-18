import { NextRequest, NextResponse } from 'next/server';
import { getRecipients, updateDeliveryStatus } from '@/lib/googleSheets';

// Verify the admin access code
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  const adminCode = process.env.ADMIN_ACCESS_CODE;

  if (!authHeader || !adminCode) {
    return false;
  }

  // Expected format: "Bearer <code>"
  const token = authHeader.replace('Bearer ', '');
  return token === adminCode;
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
    const { rowIndex, status } = body;

    if (!rowIndex || !status) {
      return NextResponse.json(
        { error: 'Missing rowIndex or status' },
        { status: 400 }
      );
    }

    const validStatuses = ['Pending', 'On the way', 'Delivered'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: Pending, On the way, or Delivered' },
        { status: 400 }
      );
    }

    const success = await updateDeliveryStatus(rowIndex, status);

    if (success) {
      return NextResponse.json({ success: true, rowIndex, status });
    } else {
      return NextResponse.json(
        { error: 'Failed to update status' },
        { status: 500 }
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
