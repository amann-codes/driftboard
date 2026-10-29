'use client';

import { useEffect, useState } from 'react';
import { currentReturnPath } from './return-to';

export function useReturnTo(fallback = '/dashboard/') {
  const [returnTo, setReturnTo] = useState(fallback);

  useEffect(() => {
    setReturnTo(currentReturnPath(fallback));
  }, [fallback]);

  return returnTo;
}
