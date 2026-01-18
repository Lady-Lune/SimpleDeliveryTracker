import { NextRequest, NextResponse } from 'next/server';

// POST /api/login - Validate admin access code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Access code is required' },
        { status: 400 }
      );
    }

    const adminCode = process.env.ADMIN_ACCESS_CODE;

    if (!adminCode) {
      console.error('ADMIN_ACCESS_CODE not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (code === adminCode) {
      return NextResponse.json({ success: true });
    } else {
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
