import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Create a response object that we can modify
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create a mutable cookies object
  const cookieStore = new Map<string, string>()

  // Check if environment variables are available
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing Supabase environment variables')
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Store the cookie for later application
          cookieStore.set(name, value)
          // Also set it on the request for immediate access
          request.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          // Remove from our store and set empty value
          cookieStore.delete(name)
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  try {
    // Get the session
    const { data: { session } } = await supabase.auth.getSession()

    const { pathname } = request.nextUrl

    // Apply all stored cookies to the response
    cookieStore.forEach((value, name) => {
      response.cookies.set(name, value)
    })

    // Redirect to dashboard if user is logged in and tries to access the root page
    if (session && pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Redirect to root if user is not logged in and tries to access dashboard
    if (!session && pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return response
  } catch (error) {
    // If there's an error, return the response without modifications
    console.error('Middleware error:', error)
    return response
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
