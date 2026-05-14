'use client'

import React from 'react'

export const YearContext = React.createContext({
  year: new Date().getFullYear(),
  setYear: () => {},
})
