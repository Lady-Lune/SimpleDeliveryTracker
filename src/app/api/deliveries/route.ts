import { NextRequest, NextResponse } from 'next/server';
import { getRecentDeliveries, getDeliveryStats } from '@/lib/googleSheets';

// Rate limiting: track requests per IP
const requestCounts = new Map<string, { count: number; windowStart: number }>();
const MAX_REQUESTS_PER_MINUTE = 60;
const WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(ip: string): { limited: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now - record.windowStart > WINDOW_MS) {
    // New window
    requestCounts.set(ip, { count: 1, windowStart: now });
    return { limited: false };
  }

  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - record.windowStart)) / 1000);
    return { limited: true, retryAfterSeconds };
  }

  record.count += 1;
  return { limited: false };
}

// GET /api/deliveries - Public endpoint for live page
// Returns last 3 deliveries + delivered/total count
export async function GET(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             request.headers.get('x-real-ip') || 
             'unknown';

  const rateLimitResult = isRateLimited(ip);
  if (rateLimitResult.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { 
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfterSeconds || 60),
        },
      }
    );
  }

  try {
    const [recentDeliveries, stats] = await Promise.all([
      getRecentDeliveries(3),
      getDeliveryStats(),
    ]);

    return NextResponse.json({
      recentDeliveries,
      delivered: stats.delivered,
      total: stats.total,
    });
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deliveries' },
      { status: 500 }
    );
  }
}
