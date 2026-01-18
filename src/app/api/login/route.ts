import { NextRequest, NextResponse } from 'next/server';

// Rate limiting: track failed attempts by IP
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

// Check if an IP is rate limited
function isRateLimited(ip: string): { limited: boolean; retryAfterSeconds?: number } {
  const record = failedAttempts.get(ip);
  if (!record) return { limited: false };

  const timeSinceLastAttempt = Date.now() - record.lastAttempt;

  // Reset if lockout period has passed
  if (timeSinceLastAttempt > LOCKOUT_DURATION_MS) {
    failedAttempts.delete(ip);
    return { limited: false };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((LOCKOUT_DURATION_MS - timeSinceLastAttempt) / 1000);
    return { limited: true, retryAfterSeconds };
  }

  return { limited: false };
}

// Record a failed attempt
function recordFailedAttempt(ip: string): void {
  const record = failedAttempts.get(ip);
  if (record) {
    record.count += 1;
    record.lastAttempt = Date.now();
  } else {
    failedAttempts.set(ip, { count: 1, lastAttempt: Date.now() });
  }
}

// Clear failed attempts on successful login
function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

// POST /api/login - Validate admin access code
export async function POST(request: NextRequest) {
  // Get client IP for rate limiting
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';

  // Check rate limiting
  const rateLimitCheck = isRateLimited(ip);
  if (rateLimitCheck.limited) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${rateLimitCheck.retryAfterSeconds} seconds.` },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Access code is required' },
        { status: 400 }
      );
    }

    const validCodes = getValidAccessCodes();

    if (validCodes.length === 0) {
      console.error('No access codes configured (ACCESS_CODES or ADMIN_ACCESS_CODE)');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (validCodes.includes(code)) {
      clearFailedAttempts(ip);
      return NextResponse.json({ success: true });
    } else {
      recordFailedAttempt(ip);
      return NextResponse.json(
        { error: 'Invalid access code' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
