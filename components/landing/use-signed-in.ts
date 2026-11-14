'use client';

import { useEffect, useState } from 'react';

// @supabase/ssr stores the session as sb-<project-ref>-auth-token (chunked as .0, .1, … when large).
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.0)?=/;

/**
 * Whether this browser holds a Supabase session cookie. Read-only on purpose: the landing page never
 * loads the Supabase client, so it cannot refresh, rotate or clear anyone's session, and stays static.
 * An expired session still reads as signed in; /app then sends the visitor to /login.
 * false until known, so the signed-out label shows first.
 */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(SESSION_COOKIE.test(document.cookie));
  }, []);
  return signedIn;
}
