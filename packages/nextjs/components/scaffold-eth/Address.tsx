"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BlockieAvatar } from "./BlockieAvatar";
import { getAddress, isAddress } from "viem";
import { useEnsAvatar, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";

type AddressProps = {
  address?: string;
  format?: "short" | "long";
  size?: "xs" | "sm" | "base" | "lg" | "xl";
  onlyEnsOrAddress?: boolean;
};

const blockieSizeMap: Record<string, number> = {
  xs: 24,
  sm: 28,
  base: 32,
  lg: 40,
  xl: 48,
};

/**
 * Displays an ethereum address with ENS name resolution, blockie avatar, copy, and basescan link.
 */
export const Address = ({ address, format = "short", size = "base", onlyEnsOrAddress = false }: AddressProps) => {
  const [checksumAddress, setChecksumAddress] = useState<string | undefined>();
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    if (address && isAddress(address)) {
      setChecksumAddress(getAddress(address));
    }
  }, [address]);

  const { data: ensName } = useEnsName({
    address: checksumAddress as `0x${string}` | undefined,
    chainId: mainnet.id,
    query: { enabled: !!checksumAddress },
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const handleCopy = () => {
    if (!checksumAddress) return;
    navigator.clipboard.writeText(checksumAddress).catch(() => {});
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  if (!checksumAddress) {
    return <span className="text-base-content/50 animate-pulse">loading...</span>;
  }

  const shortAddress = `${checksumAddress.slice(0, 6)}…${checksumAddress.slice(-4)}`;
  const displayName = ensName ?? (format === "long" ? checksumAddress : shortAddress);
  const blockieSize = blockieSizeMap[size] ?? 32;

  const sizeClasses: Record<string, string> = {
    xs: "text-xs",
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };

  if (onlyEnsOrAddress) {
    return <span className={`font-mono ${sizeClasses[size]}`}>{displayName}</span>;
  }

  return (
    <div className={`flex items-center gap-1.5 ${sizeClasses[size]}`}>
      <div className="flex-shrink-0">
        {ensAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ensAvatar}
            alt={ensName ?? checksumAddress}
            className="rounded-full"
            width={blockieSize}
            height={blockieSize}
          />
        ) : (
          <BlockieAvatar address={checksumAddress} size={blockieSize} />
        )}
      </div>
      <Link
        href={`https://basescan.org/address/${checksumAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`font-mono hover:text-primary transition-colors ${sizeClasses[size]}`}
        title={checksumAddress}
      >
        {displayName}
      </Link>
      <button onClick={handleCopy} title="Copy address">
        {copyFeedback ? (
          <CheckCircleIcon className="w-4 h-4 text-success" />
        ) : (
          <DocumentDuplicateIcon className="w-4 h-4 text-base-content/40 hover:text-base-content cursor-pointer" />
        )}
      </button>
    </div>
  );
};
