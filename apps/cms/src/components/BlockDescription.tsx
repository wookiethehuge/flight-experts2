import React from 'react'

/** Renders a short explanatory note at the top of a block in the admin (used via a `ui` field). */
export const BlockDescription: React.FC<{ text?: string }> = ({ text }) =>
  text ? <p className="block-description">{text}</p> : null
