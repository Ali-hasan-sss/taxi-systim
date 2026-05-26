"use client";

import Image from "next/image";
import appLogo from "../../../coordinator-app/assets/images/logo-removebg-preview.png";

interface DashboardBrandLogoProps {
  className?: string;
  priority?: boolean;
}

export const DashboardBrandLogo = ({ className, priority = false }: DashboardBrandLogoProps) => {
  return <Image src={appLogo} alt="Taxi Bro" className={className} priority={priority} sizes="64px" />;
};
