import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@modern-admin/ui'
import { useResources } from '../hooks.js'
import { Link } from '../router.js'

export function HomePage(): React.ReactElement {
  const resources = useResources()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resources</CardTitle>
      </CardHeader>
      <CardContent>
        {resources.length === 0 && (
          <p className="text-muted-foreground">No resources registered yet.</p>
        )}
        <ul className="grid gap-2 md:grid-cols-2">
          {resources.map((r) => (
            <li key={r.id}>
              <Link
                to={{ name: 'list', resourceId: r.id }}
                className="block rounded-md border border-border bg-card p-4 hover:border-border/70 hover:shadow"
              >
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.id}</div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
