"use client";

import { useEffect, useState } from "react";
import { BlockieAvatar } from "./BlockieAvatar";
import { getAddress, isAddress } from "viem";

type AddressProps = {
  address?: string;
  format?: "short" | "long";
  size?: "xs" | "sm" | "base" | "lg" | "xl";
};

/**
 * Displays an ethereum address with blockie avatar and copy functionality
 */
export const Address = ({ address, format = "short", size = "base" }: AddressProps) => {
  const [copied, setCopied] = useState(false);
  const [checkSumAddress, setCheckSumAddress] = useState<string | undefined>();

  useEffect(() => {
    if (address && isAddress(address)) {
      setCheckSumAddress(getAddress(address));
    }
  }, [address]);

  if (!checkSumAddress) {
    return <span className="text-base-content/50">—</span>;
  }

  const displayAddress =
    format === "long" ? checkSumAddress : `${checkSumAddress.slice(0, 6)}...${checkSumAddress.slice(-4)}`;

  const sizeClasses = {
    xs: "text-xs",
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(checkSumAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`flex items-center gap-1.5 ${sizeClasses[size]}`}>
      <BlockieAvatar address={checkSumAddress} size={size === "xs" || size === "sm" ? 16 : 24} />
      <span
        className="font-mono cursor-pointer hover:text-primary transition-colors"
        onClick={handleCopy}
        title={checkSumAddress}
      >
        {copied ? "Copied!" : displayAddress}
      </span>
    </div>
  );
};
