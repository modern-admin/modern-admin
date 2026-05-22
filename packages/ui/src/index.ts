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
export { Input, type InputProps } from './components/input.js'
export { PasswordInput, type PasswordInputProps } from './components/password-input.js'
export { Textarea, type TextareaProps } from './components/textarea.js'
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
  DateRangeInput,
  type DateRangeInputProps,
  type DateRangeInputLabels,
} from './components/date-range-input.js'
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
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/tabs.js'

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
export { InfoTooltip, type InfoTooltipProps } from './components/info-tooltip.js'
export { Kbd, getModKeyLabel } from './components/kbd.js'
export {
  KeyboardShortcutsHelp,
  type KeyboardShortcutItem,
  type KeyboardShortcutsHelpProps,
} from './components/keyboard-shortcuts-help.js'

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

// Field — pure-layout shadcn-style form-field primitives
export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldSeparator,
  FieldContent,
  type FieldProps,
} from './components/field.js'

// Sheet — side-anchored Dialog
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  type SheetContentProps,
} from './components/sheet.js'

// Empty state
export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  type EmptyMediaProps,
} from './components/empty.js'

// Sidebar
export {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
  SidebarInput,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
  type SidebarProps,
  type SidebarProviderProps,
  type SidebarMenuButtonProps,
} from './components/sidebar.js'

// Richtext
export {
  RichtextEditor,
  type RichtextEditorProps,
  type RichtextFormat,
} from './components/richtext-editor.js'
export {
  RichtextRender,
  type RichtextRenderProps,
} from './components/richtext-render.js'

// Media preview (Preview button + dialog with image/video + Download)
export {
  MediaPreview,
  detectMediaKind,
  type MediaPreviewProps,
  type MediaKind,
} from './components/media-preview.js'

// JSON editor + viewer
export {
  JsonEditor,
  JsonView,
  type JsonEditorProps,
  type JsonViewProps,
} from './components/json-editor.js'

// Combobox — free-text autocomplete input with optional suggestions
export {
  Combobox,
  type ComboboxProps,
  type ComboboxLabels,
  type ComboboxSuggestion,
} from './components/combobox.js'

// Key-value editor + viewer (fixed-keys alternative to JsonEditor)
export {
  KeyValueEditor,
  KeyValueView,
  type KeyValueEditorProps,
  type KeyValueEditorLabels,
  type KeyValueViewProps,
  type KeyValueViewLabels,
  type KeyValueFieldSpec,
  type KeyValueFieldType,
} from './components/key-value-editor.js'

// File input (upload drop-zone + current file display)
export { FileInput, type FileInputProps } from './components/file-input.js'
export {
  MultiFileInput,
  type MultiFileInputProps,
  type MultiFileInputItem,
  type MultiFileInputPendingItem,
} from './components/multi-file-input.js'

// Toast
export { Toaster, toast, type ToasterProps } from './components/sonner.js'

// Chart
export {
  ChartPanel,
  KpiCard,
  TimeSeriesChart,
  type ChartType,
  type ChartDataPoint,
  type ChartPanelLabels,
  type ChartPanelProps,
  type KpiCardLabels,
  type KpiCardProps,
  type TimeSeriesChartLabels,
  type TimeSeriesChartProps,
  type TimeSeriesChartSeries,
} from './components/chart.js'

// History / audit log
export {
  DiffView,
  type DiffField,
  type DiffViewLabels,
  type DiffViewProps,
} from './components/diff-view.js'
export {
  RevisionTimeline,
  type RevisionTimelineItem,
  type RevisionTimelineLabels,
  type RevisionTimelineProps,
} from './components/revision-timeline.js'
export {
  AuditTimeline,
  type AuditTimelineItem,
  type AuditTimelineLabels,
  type AuditTimelineProps,
} from './components/audit-timeline.js'

export const VERSION = '0.0.0'
