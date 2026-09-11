import {
  Pill,
  Stethoscope,
  Heart,
  HeartPulse,
  Activity,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Bell,
  Plus,
  Check,
  X,
  Pencil,
  Upload,
  FileText,
  Settings,
  Mic,
  Send,
  Sparkles,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Flame,
  TestTube,
  Syringe,
  Paperclip,
  Mail,
  MapPin,
  Clock,
  User,
  Home,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Camera,
  LogOut,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

// Mapeo del set de íconos custom del diseño (Icons.jsx) a lucide-react, ya
// integrado en el proyecto — no se porta el SVG 1:1, se usa el equivalente
// semántico más cercano.
const MAPA: Record<string, ComponentType<LucideProps>> = {
  pill: Pill,
  stethoscope: Stethoscope,
  heart: Heart,
  "heart-plus": HeartPulse,
  activity: Activity,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
  "chevron-down": ChevronDown,
  bell: Bell,
  plus: Plus,
  check: Check,
  close: X,
  edit: Pencil,
  upload: Upload,
  doc: FileText,
  settings: Settings,
  mic: Mic,
  send: Send,
  sparkle: Sparkles,
  sunrise: Sunrise,
  sun: Sun,
  sunset: Sunset,
  moon: Moon,
  flame: Flame,
  vial: TestTube,
  syringe: Syringe,
  paperclip: Paperclip,
  gmail: Mail,
  google: Mail, // el botón de Google usa su propio SVG de marca, no este ícono genérico
  location: MapPin,
  clock: Clock,
  user: User,
  home: Home,
  routine: ListChecks,
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  camera: Camera,
  logout: LogOut,
};

export function VitaIcon({
  name,
  size = 20,
  color,
  strokeWidth,
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  const Comp = MAPA[name] ?? Activity;
  return <Comp size={size} color={color} strokeWidth={strokeWidth} className={className} />;
}
