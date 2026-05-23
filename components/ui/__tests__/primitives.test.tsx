// @vitest-environment jsdom
// T4.1 — each shadcn primitive mounts without error and exposes its expected
// ARIA role / accessible name. The primitives are owned by WS-4 and added via
// `pnpm dlx shadcn add …` against the configured radix-maia registry; this
// suite imports them by their canonical path (`@/components/ui/<name>`) so the
// red phase fails with "Cannot find module" until they're generated.
//
// We use roles + names that are standard for the underlying Radix primitives:
// - Input  → role="textbox"
// - Card   → renders any heading/content (no implicit role); we settle for a
//            data-slot probe + that children render.
// - Checkbox → role="checkbox"
// - Dialog → role="dialog" once open (via controlled `open` prop)
// - Tabs   → role="tablist" + role="tab" + role="tabpanel"
// - Badge  → renders children (no implicit role; just must mount)
// - Select → role="combobox" on the trigger
// - Sonner (Toaster) → renders a live region (role="region"/aria-label or
//   role="status"); we assert it mounts and produces *something* in the DOM.
// - Skeleton → renders an element (no implicit role); just mounts.
// - Separator → role="separator"
// - Label  → renders <label> with associated text
// - Tooltip → role="tooltip" once shown (via controlled `open`)
// - Button (already exists) → role="button"

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// --- Imports (these will fail at module resolution until WS-4.1 generates them).
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

describe('T4.1 shadcn primitives mount with expected ARIA', () => {
  it('Input — role=textbox', () => {
    render(<Input aria-label="email" defaultValue="x" />)
    expect(screen.getByRole('textbox', { name: 'email' })).toBeInTheDocument()
  })

  it('Card — renders header + content children', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Hello card</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>
    )
    expect(screen.getByText('Hello card')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('Checkbox — role=checkbox', () => {
    render(<Checkbox aria-label="agree" />)
    expect(screen.getByRole('checkbox', { name: 'agree' })).toBeInTheDocument()
  })

  it('Dialog — role=dialog when open', () => {
    render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A dialog</DialogTitle>
          </DialogHeader>
          dialog body
        </DialogContent>
      </Dialog>
    )
    // Radix Dialog renders into a portal; default jsdom is fine for that.
    expect(screen.getByRole('dialog', { name: 'A dialog' })).toBeInTheDocument()
  })

  it('Tabs — exposes tablist / tab / tabpanel', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList aria-label="sections">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">first panel</TabsContent>
        <TabsContent value="two">second panel</TabsContent>
      </Tabs>
    )
    expect(screen.getByRole('tablist', { name: 'sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'One' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'One' })).toBeInTheDocument()
  })

  it('Badge — mounts and renders children', () => {
    render(<Badge>new</Badge>)
    expect(screen.getByText('new')).toBeInTheDocument()
  })

  it('Select — trigger has role=combobox with accessible name', () => {
    render(
      <Select>
        <SelectTrigger aria-label="state">
          <SelectValue placeholder="pick a state" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ca">California</SelectItem>
          <SelectItem value="or">Oregon</SelectItem>
        </SelectContent>
      </Select>
    )
    expect(screen.getByRole('combobox', { name: 'state' })).toBeInTheDocument()
  })

  it('Sonner Toaster — mounts (no throw); produces an element', () => {
    const { container } = render(<Toaster />)
    // sonner renders a top-level <section> / <ol> live-region container.
    expect(container.firstChild).not.toBeNull()
  })

  it('Skeleton — mounts (no throw)', () => {
    const { container } = render(<Skeleton data-testid="sk" />)
    expect(container.querySelector('[data-testid="sk"]')).not.toBeNull()
  })

  it('Separator — role=separator', () => {
    render(<Separator aria-label="rule" />)
    expect(screen.getByRole('separator', { name: 'rule' })).toBeInTheDocument()
  })

  it('Label — renders associated text', () => {
    render(
      <>
        <Label htmlFor="x">Name</Label>
        <input id="x" />
      </>
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    // Label htmlFor wires up the textbox by name.
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })

  it('Tooltip — role=tooltip when open', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button>hover me</button>
          </TooltipTrigger>
          <TooltipContent>helpful text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('helpful text')
  })

  it('Button (existing) — role=button', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
