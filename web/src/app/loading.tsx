/** Instant loading state shown while a page reads the results folder. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#070A10', color: '#A3AEC2', fontFamily: "'Manrope', system-ui, sans-serif", fontSize: 14 }}
    >
      Loading…
    </div>
  );
}
