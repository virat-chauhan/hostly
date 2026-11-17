const paths = {
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 20h16',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.4 3.8-5.4 3.8-9S14.5 5.4 12 3m0 18c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3M3.5 9h17M3.5 15h17',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  lock: 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v9H5z',
  rewind: 'M11 7 4 12l7 5V7Zm9 0-7 5 7 5V7Z',
  box: 'M12 3 4 7v10l8 4 8-4V7l-8-4Zm0 9L4 7.5M12 12l8-4.5M12 12v9',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 7.5C3.8 9.3 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
};

export default function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
