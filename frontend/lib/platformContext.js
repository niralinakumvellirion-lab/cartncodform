'use client';

import { createContext, useContext } from 'react';

export const PlatformStaffContext = createContext(null);

export function usePlatformStaff() {
  return useContext(PlatformStaffContext);
}
