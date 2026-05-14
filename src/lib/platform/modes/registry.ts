import {
  CalendarCheck,
  ChartBar,
  ChatText,
  Clock,
  Eye,
  Gear,
  Phone,
  TrendUp,
  Tray,
  UserCircle,
  Users,
  VideoCamera,
} from "@phosphor-icons/react/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { UserType } from "@/lib/supabase/types";

export type AppMode = "career" | "gtm" | "research";

export interface ModeNavItem {
  href: string;
  label: string;
  icon: PhosphorIcon;
  badge?: string;
}

export interface ModeCommandItem {
  id: string;
  label: string;
  href: string;
  icon: PhosphorIcon;
}

interface ModeDefinition {
  id: AppMode;
  label: string;
  defaultHref: string;
  navItems: ModeNavItem[];
  commandItems: ModeCommandItem[];
}

export const MODE_DEFINITIONS: Record<AppMode, ModeDefinition> = {
  career: {
    id: "career",
    label: "Career",
    defaultHref: "/career",
    navItems: [
      { href: "/career", label: "Today", icon: CalendarCheck },
      { href: "/career/profile", label: "Profile", icon: UserCircle },
      { href: "/career/history", label: "History", icon: Clock },
      { href: "/career/watchlist", label: "Watchlist", icon: Eye },
      { href: "/career/analytics", label: "Analytics", icon: ChartBar },
      { href: "/settings", label: "Settings", icon: Gear },
    ],
    commandItems: [
      {
        id: "today",
        label: "Go to Today",
        href: "/career",
        icon: CalendarCheck,
      },
      {
        id: "profile",
        label: "Go to Profile",
        href: "/career/profile",
        icon: UserCircle,
      },
      {
        id: "history",
        label: "Go to History",
        href: "/career/history",
        icon: Clock,
      },
      {
        id: "watchlist",
        label: "Go to Watchlist",
        href: "/career/watchlist",
        icon: Eye,
      },
      {
        id: "settings",
        label: "Go to Settings",
        href: "/settings",
        icon: Gear,
      },
    ],
  },
  gtm: {
    id: "gtm",
    label: "GTM",
    defaultHref: "/gtm/icp",
    navItems: [
      { href: "/gtm/icp", label: "Your ICP", icon: CalendarCheck },
      { href: "/gtm/video-icp", label: "Video ICP", icon: VideoCamera },
      { href: "/gtm/prospects", label: "Prospects", icon: Users },
      { href: "/gtm/accounts", label: "Accounts", icon: Tray },
      { href: "/gtm/messaging", label: "Messaging", icon: ChatText },
      { href: "/gtm/calls", label: "Calls", icon: Phone, badge: "POC" },
      { href: "/gtm/trends", label: "Trends", icon: TrendUp, badge: "POC" },
      { href: "/settings", label: "Settings", icon: Gear },
    ],
    commandItems: [
      {
        id: "icp",
        label: "Go to ICP",
        href: "/gtm/icp",
        icon: CalendarCheck,
      },
      {
        id: "video-icp",
        label: "Go to Video ICP",
        href: "/gtm/video-icp",
        icon: VideoCamera,
      },
      {
        id: "prospects",
        label: "Go to Prospects",
        href: "/gtm/prospects",
        icon: Users,
      },
      {
        id: "accounts",
        label: "Go to Accounts",
        href: "/gtm/accounts",
        icon: Tray,
      },
      {
        id: "settings",
        label: "Go to Settings",
        href: "/settings",
        icon: Gear,
      },
    ],
  },
  research: {
    id: "research",
    label: "Research",
    defaultHref: "/research",
    navItems: [],
    commandItems: [],
  },
};

export const ROUTE_TITLES: Record<string, string> = {
  "/career": "Today",
  "/career/profile": "Profile",
  "/career/history": "History",
  "/career/watchlist": "Watchlist",
  "/career/settings": "Settings",
  "/career/analytics": "Analytics",
  "/career/activate": "Activate",
  "/career/analysis": "Analysis",
  "/career/outreach": "Outreach",
  "/career/coaching": "Coaching",
  "/career/trail": "Trail",
  "/gtm/icp": "Your ICP",
  "/gtm/video-icp": "Video ICP",
  "/gtm/accounts": "Accounts",
  "/gtm/activate": "Activate",
  "/gtm/prospects": "Prospects",
  "/gtm/messaging": "Messaging",
  "/gtm/calls": "Calls",
  "/gtm/trends": "Trends",
  "/research": "Research",
  "/settings": "Settings",
};

export function getModeForUserType(userType: UserType | null): AppMode {
  return userType === "gtm" ? "gtm" : "career";
}

export function getDefaultHrefForUserType(userType: UserType | null): string {
  return MODE_DEFINITIONS[getModeForUserType(userType)].defaultHref;
}

export function getNavItemsForUserType(userType: UserType | null): ModeNavItem[] {
  return MODE_DEFINITIONS[getModeForUserType(userType)].navItems;
}

export function getCommandItemsForUserType(
  userType: UserType | null,
): ModeCommandItem[] {
  return MODE_DEFINITIONS[getModeForUserType(userType)].commandItems;
}

export function getTitleForPathname(
  pathname: string,
  userType: UserType | null,
): string {
  const key = Object.keys(ROUTE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((route) =>
      route === "/"
        ? pathname === "/"
        : pathname === route || pathname.startsWith(`${route}/`),
    );

  if (key) return ROUTE_TITLES[key];
  return userType === "job_seeker" ? "Job Search" : "Searchcraft";
}
