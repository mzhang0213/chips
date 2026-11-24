'use client';

import dynamic from 'next/dynamic';

// The game lives in localStorage, so render it in the browser only (no server HTML to mismatch).
const App = dynamic(() => import('../App'), { ssr: false });

export default function Page() {
  return <App />;
}
