'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { authFetch } from '@/lib/auth/auth-fetch'
import type { SearchResult } from '@/types/database'

export function TopBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    const timer = setTimeout(async () => {
      const res = await authFetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data)
      setOpen(true)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(result: SearchResult) {
    setOpen(false)
    setQuery('')
    const typeRoute: Record<string, string> = {
      account: '/accounts',
      contact: '/contacts',
      lead: '/leads',
    }
    router.push(typeRoute[result.result_type] ?? '/accounts')
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.result_type ?? 'Other'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <header className="flex h-14 items-center border-b px-6 gap-4">
      <div ref={ref} className="relative w-96">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search accounts, contacts, leads..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-lg">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {type}
                </div>
                {items.map((item) => (
                  <button
                    key={item.result_id}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer text-left"
                    onClick={() => handleSelect(item)}
                  >
                    <span className="font-medium">{item.display_name}</span>
                    {item.phone && (
                      <span className="text-muted-foreground">{item.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        <span className="text-sm text-muted-foreground">PETTR</span>
      </div>
    </header>
  )
}
