import type { Metadata } from "next"
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Section,
} from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

// WS-4.6: dev-only visual checklist. `noindex` keeps it out of search.
// Future production filter can move this under `app/(dev)/styleguide` and
// 404 in prod if needed.
export const metadata: Metadata = {
  title: "Bearcamp · Styleguide",
  robots: { index: false, follow: false },
}

export default function StyleguidePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10">
      <PageHeader
        title="Styleguide"
        description="Visual reference for shadcn primitives and app-level building blocks."
        actions={<Button variant="outline">Action</Button>}
      />

      <Section title="Typography" actions={<Badge>WS-4</Badge>}>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl">Heading 1</h1>
          <h2 className="font-heading text-2xl">Heading 2</h2>
          <h3 className="font-heading text-xl">Heading 3</h3>
          <p className="text-base text-foreground">Body</p>
          <p className="text-sm text-muted-foreground">Muted body</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-name">Name</Label>
            <Input id="sg-name" placeholder="Your name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-state">State</Label>
            <Select>
              <SelectTrigger id="sg-state" aria-label="state">
                <SelectValue placeholder="Pick a state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ca">California</SelectItem>
                <SelectItem value="or">Oregon</SelectItem>
                <SelectItem value="wa">Washington</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="sg-agree" />
            <Label htmlFor="sg-agree">I agree</Label>
          </div>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="one">
          <TabsList aria-label="example tabs">
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel</TabsContent>
          <TabsContent value="two">Second panel</TabsContent>
        </Tabs>
      </Section>

      <Section title="Cards">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Short supporting copy.</CardDescription>
          </CardHeader>
          <CardContent>Body content goes here.</CardContent>
        </Card>
      </Section>

      <Separator aria-label="end of primitives" />

      <Section title="States">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState
            title="No trips yet"
            description="Start by picking a campsite from the list."
            action={<Button>Find a campsite</Button>}
          />
          <ErrorState
            title="Couldn't load"
            message="Network error. Try again in a moment."
            action={<Button variant="outline">Retry</Button>}
          />
        </div>
        <div className="pt-4">
          <ListSkeleton rows={3} />
        </div>
        <div className="flex flex-col gap-2 pt-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Section>
    </main>
  )
}
