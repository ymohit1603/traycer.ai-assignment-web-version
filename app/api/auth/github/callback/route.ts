import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('❌ GitHub OAuth error:', error);
      return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    if (!code) {
      console.error('❌ No authorization code received');
      return NextResponse.redirect(new URL('/?error=no_code', request.url));
    }

    console.log('🔑 Processing GitHub OAuth callback...');

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        code,
        state: state || ''
      })
    });

    if (!tokenResponse.ok) {
      console.error('❌ Failed to exchange code for token');
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('❌ Token exchange error:', tokenData.error);
      return NextResponse.redirect(new URL(`/?error=${tokenData.error}`, request.url));
    }

    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;
    const tokenType = tokenData.token_type;

    console.log('✅ GitHub OAuth successful, scopes:', scope);

    // Set secure cookie with the access token
    const response = NextResponse.redirect(new URL('/?github_auth=success', request.url));
    
    // Set HTTP-only cookie for security
    response.cookies.set('github_access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    });

    response.cookies.set('github_token_scope', scope || '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    });

    return response;

  } catch (error) {
    console.error('❌ GitHub OAuth callback error:', error);
    return NextResponse.redirect(new URL('/?error=callback_failed', request.url));
  }
}
