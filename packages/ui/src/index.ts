// @modern-admin/ui — minimal shadcn-flavoured kit. We hand-roll the primitives
// rather than running the shadcn CLI so the source ships in TS-friendly files
// the workspace can consume without a generation step.

export { cn } from './lib/utils.js'
export {
  initTheme,
  readThemeMode,
  setThemeMode,
  type ThemeMode,
} from './lib/theme.js'
export { Button, buttonVariants, type ButtonProps } from './components/button.js'
export { Input, Textarea, type InputProps } from './components/input.js'
export { Label } from './components/label.js'
export { Select, type SelectProps } from './components/select.js'
export { Badge, type BadgeProps } from './components/badge.js'
export {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from './components/card.js'
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './components/table.js'

export const VERSION = '0.0.0'
