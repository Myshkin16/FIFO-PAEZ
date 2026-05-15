// Next.js 16 renamed Middleware to Proxy. Same concept: runs before every
// request matching the matcher. This is our auth gate — every page and API
// route is protected EXCEPT the sign-in / sign-up flows.
//
// Pages → unauthenticated users redirect to /sign-in.
// API routes → return 401 JSON.
//
// In addition to the gate, the actual access policy (who can sign in) lives
// in the Clerk dashboard:
//   User & Authentication → Restrictions → Allowlist
// Add your own email and reject everything else. Without that step the gate
// is open to anyone who knows how to click "Sign up".

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API
    '/__clerk/(.*)',
  ],
}
