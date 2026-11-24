import { useEffect, useState } from 'react';
import { Alert } from './components.jsx';
import { api } from './api.js';

export function useLoad(path) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ path, version, data });
      },
      (error) => {
        if (!controller.signal.aborted) setResult({ path, version, error: error.message });
      },
    );
    return () => controller.abort();
  }, [path, version]);
  const current = result?.path === path ? result : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: Boolean(path) && current?.version !== version,
    reload: () => setVersion((value) => value + 1),
  };
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const run = async (fn, success) => {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await fn();
      if (success) setMessage({ type: 'success', text: typeof success === 'function' ? success(result) : success });
      return result;
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const clear = () => setMessage({ type: '', text: '' });
  const alert = message.text ? (
    <Alert type={message.type} onClose={clear}>
      {message.text}
    </Alert>
  ) : null;
  return { busy, run, alert, clear };
}

export const formData = (e) => Object.fromEntries(new FormData(e.currentTarget).entries());
