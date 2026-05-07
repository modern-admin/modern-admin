// @modern-admin/ui — shadcn-flavoured kit for the admin frontend. Built on
// Radix primitives + Tailwind 4 + the semantic CSS variables in styles.css.

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './components/accordion.js'

export { cn } from './lib/utils.js'
export {
  initTheme,
  readThemeMode,
  setThemeMode,
  type ThemeMode,
} from './lib/theme.js'

// Form-control primitives
export { Button, buttonVariants, type ButtonProps } from './components/button.js'
export { Input, Textarea, type InputProps } from './components/input.js'
export { Label } from './components/label.js'
export { Checkbox } from './components/checkbox.js'
export { Switch } from './components/switch.js'
export { Calendar, type CalendarProps } from './components/calendar.js'
export {
  DatePicker,
  type DatePickerProps,
  type DatePickerMode,
} from './components/date-picker.js'
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  NativeSelect,
  type NativeSelectProps,
} from './components/select.js'

// Layout / display
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from './components/breadcrumb.js'
export { Badge, badgeVariants, type BadgeProps } from './components/badge.js'
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card.js'
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from './components/table.js'
export { Avatar, AvatarImage, AvatarFallback } from './components/avatar.js'
export { Separator } from './components/separator.js'
export { ScrollArea, ScrollBar } from './components/scroll-area.js'
export { Skeleton } from './components/skeleton.js'

// Overlay / floating
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/dialog.js'
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './components/alert-dialog.js'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './components/dropdown-menu.js'
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from './components/popover.js'
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/tooltip.js'

// Command / Combobox base
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from './components/command.js'

// Form (react-hook-form bindings)
export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  useFormField,
} from './components/form.js'

// Toast
export { Toaster, toast, type ToasterProps } from './components/sonner.js'

export const VERSION = '0.0.0'
