'use client'
import type { DefaultCellComponentProps } from 'payload'
import { toast, useConfig } from '@payloadcms/ui'
import React, { useState } from 'react'

/**
 * List-view cell for `testimonials.approved`: a switch that saves immediately, so editors can approve synced
 * Trustpilot reviews straight from the list. (For many at once: select rows > Edit > Approved.)
 */
export const ApprovedCell: React.FC<DefaultCellComponentProps> = ({ cellData, rowData, collectionSlug }) => {
  const { config } = useConfig()
  const [value, setValue] = useState<boolean>(cellData === true)
  const [busy, setBusy] = useState(false)
  const id = rowData?.id

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy || id === undefined) return
    const next = !value
    setBusy(true)
    try {
      const res = await fetch(`${config.serverURL}${config.routes.api}/${collectionSlug}/${id}?depth=0`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setValue(next)
      toast.success(next ? 'Approved: shown on the site after the next build.' : 'Unapproved: hidden after the next build.')
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={`Approved: ${String(rowData?.name ?? id)}`}
      disabled={busy}
      onClick={toggle}
      className={`approved-cell${value ? ' approved-cell--on' : ''}`}
    >
      <span className="approved-cell__track" aria-hidden="true">
        <span className="approved-cell__thumb" />
      </span>
      <span className="approved-cell__label">{value ? 'Yes' : 'No'}</span>
    </button>
  )
}
