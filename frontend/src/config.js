const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_URL = (
  import.meta.env.VITE_API_URL || (isLocal ? 'http://localhost:3000' : 'https://guesthouse-api.vercel.app')
).replace(/\/$/, '');
