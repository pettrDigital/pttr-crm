import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const clientCategoryStyles: Record<string, string> = {
  strata: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  residential: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  cod: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  do_not_trade: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

const funnelStageStyles: Record<string, string> = {
  'Paid Job': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'Booked - Pending': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'Booked - Did Not Complete': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  'Not Booked': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  'Not Quotable': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  'Not Captured': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
}

const profileStyles: Record<string, string> = {
  PTTR: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  ETTR: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
}

export function ClientCategoryBadge({ category }: { category: string }) {
  const key = category?.toLowerCase() ?? ''
  return (
    <Badge variant="secondary" className={cn('font-medium', clientCategoryStyles[key] ?? '')}>
      {category}
    </Badge>
  )
}

export function FunnelStageBadge({ stage }: { stage: string }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', funnelStageStyles[stage] ?? '')}>
      {stage}
    </Badge>
  )
}

export function ProfileBadge({ profile }: { profile: string }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', profileStyles[profile] ?? '')}>
      {profile}
    </Badge>
  )
}

export function AfterHoursBadge() {
  return (
    <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300 font-medium">
      After Hours
    </Badge>
  )
}
