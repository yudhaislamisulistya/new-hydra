import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Cloud,
  Crown,
  Flame,
  Flower2,
  Gem,
  Glasses,
  Headphones,
  Heart,
  Medal,
  PartyPopper,
  Ribbon,
  Shield,
  Star,
  Sun,
  Trophy,
  WandSparkles,
} from "lucide-react";

export type BuddyColor = {
  id: string;
  color: string;
  bg: string;
  minLevel: number;
  name: string;
};

export type BuddyAccessory = {
  id: string;
  icon: LucideIcon | null;
  minLevel: number;
  name: string;
  color?: string;
};

export const BUDDY_COLORS: BuddyColor[] = [
  { id: "blue", color: "text-blue-500", bg: "bg-blue-500", minLevel: 1, name: "Biru Air" },
  { id: "green", color: "text-green-500", bg: "bg-green-500", minLevel: 2, name: "Hijau Alam" },
  { id: "purple", color: "text-purple-500", bg: "bg-purple-500", minLevel: 3, name: "Ungu Mistis" },
  { id: "orange", color: "text-orange-500", bg: "bg-orange-500", minLevel: 4, name: "Emas Juara" },
  { id: "rose", color: "text-rose-500", bg: "bg-rose-500", minLevel: 5, name: "Merah Ceria" },
  { id: "cyan", color: "text-cyan-500", bg: "bg-cyan-500", minLevel: 6, name: "Cyan Segar" },
  { id: "emerald", color: "text-emerald-500", bg: "bg-emerald-500", minLevel: 7, name: "Emerald Hidrasi" },
  { id: "amber", color: "text-amber-500", bg: "bg-amber-500", minLevel: 8, name: "Amber Energi" },
];

export const BUDDY_ACCESSORIES: BuddyAccessory[] = [
  { id: "none", icon: null, minLevel: 1, name: "Polos" },
  { id: "glasses", icon: Glasses, minLevel: 2, name: "Kacamata Pintar", color: "text-slate-800" },
  { id: "heart", icon: Heart, minLevel: 2, name: "Hati Sehat", color: "text-rose-400 fill-rose-400" },
  { id: "star", icon: Star, minLevel: 3, name: "Bintang Terang", color: "text-yellow-400 fill-yellow-400" },
  { id: "shield", icon: Shield, minLevel: 3, name: "Perisai Hidrasi", color: "text-sky-500" },
  { id: "crown", icon: Crown, minLevel: 4, name: "Mahkota Raja", color: "text-yellow-500 fill-yellow-500" },
  { id: "medal", icon: Medal, minLevel: 4, name: "Medali Juara", color: "text-amber-500" },
  { id: "flower", icon: Flower2, minLevel: 5, name: "Bunga Segar", color: "text-pink-400" },
  { id: "flame", icon: Flame, minLevel: 5, name: "Api Semangat", color: "text-orange-500 fill-orange-200" },
  { id: "headphones", icon: Headphones, minLevel: 6, name: "Headset Fokus", color: "text-indigo-500" },
  { id: "gem", icon: Gem, minLevel: 6, name: "Permata Biru", color: "text-cyan-500" },
  { id: "magic", icon: WandSparkles, minLevel: 7, name: "Tongkat Ajaib", color: "text-purple-500" },
  { id: "cloud", icon: Cloud, minLevel: 7, name: "Awan Sejuk", color: "text-sky-300 fill-sky-100" },
  { id: "sun", icon: Sun, minLevel: 8, name: "Matahari Cerah", color: "text-amber-400" },
  { id: "trophy", icon: Trophy, minLevel: 9, name: "Piala Hebat", color: "text-yellow-600" },
  { id: "ribbon", icon: Ribbon, minLevel: 10, name: "Pita Prestasi", color: "text-fuchsia-500" },
  { id: "verified", icon: BadgeCheck, minLevel: 11, name: "Lencana Ahli", color: "text-blue-600 fill-blue-100" },
  { id: "party", icon: PartyPopper, minLevel: 12, name: "Pesta Hidrasi", color: "text-emerald-500" },
];

export function getBuddyColor(colorId: string | null | undefined) {
  return BUDDY_COLORS.find((color) => color.id === colorId) || BUDDY_COLORS[0];
}

export function getBuddyAccessory(accessoryId: string | null | undefined) {
  return BUDDY_ACCESSORIES.find((accessory) => accessory.id === accessoryId) || BUDDY_ACCESSORIES[0];
}
