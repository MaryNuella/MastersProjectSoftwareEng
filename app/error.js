'use client';
export default function ErrorPage({reset}){return <main className="landing"><h1>The workspace could not be displayed</h1><p>Reload this view. If the problem continues, verify your Supabase configuration and inspect the server log.</p><button onClick={reset}>Try again</button></main>;}
