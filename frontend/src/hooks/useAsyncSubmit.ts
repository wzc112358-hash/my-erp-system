import { useCallback, useRef, useState } from 'react';

export const useAsyncSubmit = <T,>(
  onSubmit: (values: T) => void | Promise<void>,
) => {
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (values: T): Promise<void> => {
    if (inFlight.current) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [onSubmit]);

  return { submit, submitting };
};
