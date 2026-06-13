import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Home,
  ListOrdered,
  MapPinned,
  MessageSquareText,
  Settings,
  Users,
  Wallet
} from "lucide-react";

export type DashboardNavIconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

function navIcon(Icon: LucideIcon) {
  return function DashboardNavIcon({ className, size = 20, strokeWidth = 2 }: DashboardNavIconProps) {
    return <Icon className={className} size={size} strokeWidth={strokeWidth} aria-hidden />;
  };
}

export const DashboardHomeIcon = navIcon(Home);
export const DashboardOrdersRoomIcon = navIcon(ClipboardList);
export const DashboardOrdersListIcon = navIcon(ListOrdered);
export const DashboardChatIcon = navIcon(MessageSquareText);
export const DashboardEmployeesIcon = navIcon(Users);
export const DashboardDriversIcon = navIcon(MapPinned);
export const DashboardFinanceIcon = navIcon(Wallet);
export const DashboardSettingsIcon = navIcon(Settings);
