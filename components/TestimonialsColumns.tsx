"use client";
import React, { useState } from "react";
import { motion } from "motion/react";

// Helper function to format wallet address (0x1234...5678)
const formatWalletAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Generate avatar URL with multiple fallback options
const getAvatarUrls = (address: string): string[] => {
  const normalizedAddress = address.toLowerCase();
  return [
    `https://effigy.im/a/${normalizedAddress}.svg`,
    `https://avatar.vercel.sh/${normalizedAddress}`,
    `https://ui-avatars.com/api/?name=${encodeURIComponent(normalizedAddress)}&background=random&size=128`,
  ];
};

const AvatarImage = ({ address, alt }: { address: string; alt: string }) => {
  const [imgSrc, setImgSrc] = useState(getAvatarUrls(address)[0]);
  const [errorCount, setErrorCount] = useState(0);
  const fallbacks = getAvatarUrls(address);

  const handleError = () => {
    if (errorCount < fallbacks.length - 1) {
      setErrorCount(errorCount + 1);
      setImgSrc(fallbacks[errorCount + 1]);
    } else {
      // Final fallback: generate a simple colored circle based on address hash
      const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const hue = hash % 360;
      setImgSrc(`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="hsl(${hue}, 70%, 50%)"/></svg>`)}`);
    }
  };

  return (
    <img
      width={40}
      height={40}
      src={imgSrc}
      alt={alt}
      className="h-10 w-10 rounded-full flex-shrink-0"
      onError={handleError}
    />
  );
};

const TestimonialsColumn = (props: {
  className?: string;
  testimonials: any;
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6 bg-background"
      >
        
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, wallet, role }: any, i: any) => {
                const walletAddress = wallet || "0x0000000000000000000000000000000000000000";
                return (
                  <div className="p-10 rounded-3xl border shadow-lg shadow-primary/10 max-w-xs w-full" key={i}>
                    <div>{text}</div>
                    <div className="flex items-center gap-2 mt-5">
                      <AvatarImage 
                        address={walletAddress} 
                        alt={formatWalletAddress(walletAddress)} 
                      />
                      <div className="flex flex-col">
                        <div className="font-medium tracking-tight leading-5 font-mono text-sm">
                          {formatWalletAddress(walletAddress)}
                        </div>
                        {role && (
                          <div className="leading-5 opacity-60 tracking-tight text-xs">
                            {role}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  );
};

export default TestimonialsColumn;