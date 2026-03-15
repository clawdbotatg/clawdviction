"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
  external?: boolean;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Stake",
    href: "/stake",
  },
  {
    label: "Train",
    href: "/train",
  },
  {
    label: "Gov",
    href: "/gov",
  },
  {
    label: "Forum",
    href: "/forum",
  },
  {
    label: "Labs",
    href: "/labs",
  },
  {
    label: "Chat",
    href: "https://t.me/ClawdChatTGBot",
    external: true,
  },
  {
    label: "CV",
    href: "/cv",
  },
  {
    label: "About",
    href: "/about",
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
  const { address } = useAccount();
  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  const allLinks = isAdmin ? [...menuLinks, { label: "Admin", href: "/admin" }] : menuLinks;

  return (
    <>
      {allLinks.map(({ label, href, icon, external }) => {
        const isActive = pathname === href;
        const className = `${
          isActive ? "bg-secondary shadow-md" : ""
        } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`;
        return (
          <li key={href}>
            {external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {icon}
                <span>{label}</span>
              </a>
            ) : (
              <Link href={href} passHref className={className}>
                {icon}
                <span>{label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky lg:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-md shadow-secondary px-0 sm:px-2">
      <div className="navbar-start w-auto lg:w-1/2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="hidden lg:flex items-center gap-2 ml-4 mr-6 shrink-0">
          <Image src="/logo.jpg" alt="larv.ai" width={40} height={40} className="rounded-full" />
          <span className="font-bold leading-tight">larv.ai</span>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-4">
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};
