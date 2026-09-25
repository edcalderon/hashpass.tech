"use client";
import dynamic from "next/dynamic";
const HashpassSupport = dynamic(() => import("@hashpass/support-react").then((m) => m.HashpassSupport), { ssr: false });
export default function Support() { return <HashpassSupport appId="PUBLIC_APP_ID" locale="en" />; }
