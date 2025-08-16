"use client";

import { useEffect, useState } from 'react';

export default function EnvCheck() {
  const [envStatus, setEnvStatus] = useState<{
    supabaseUrl: string | null;
    supabaseKey: string | null;
    hasError: boolean;
  }>({
    supabaseUrl: null,
    supabaseKey: null,
    hasError: false,
  });

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    setEnvStatus({
      supabaseUrl,
      supabaseKey,
      hasError: !supabaseUrl || !supabaseKey,
    });
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return null; // Don't show in production
  }

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded text-xs max-w-xs">
      <div className="font-bold mb-1">Environment Check:</div>
      <div>SUPABASE_URL: {envStatus.supabaseUrl ? '✅ Set' : '❌ Missing'}</div>
      <div>SUPABASE_KEY: {envStatus.supabaseKey ? '✅ Set' : '❌ Missing'}</div>
      {envStatus.hasError && (
        <div className="text-red-600 font-bold mt-1">
          ⚠️ Supabase not configured!
        </div>
      )}
    </div>
  );
}
