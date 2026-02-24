import { useEffect } from "react";

interface SupportWidgetProps {
  accountId: string;
  baseUrl?: string;
  email?: string;
  name?: string;
  metadata?: Record<string, any>;
  metadataToken?: string;
  primaryColor?: string;
  controlledByHost?: boolean;
  widgetIsOpen?: boolean;
  onClose?: () => void;
}

declare global {
  interface Window {
    SupportWidget?: {
      accountId: string;
      email?: string;
      name?: string;
      metadata?: Record<string, any>;
      metadataToken?: string;
      primaryColor?: string;
      controlledByHost?: boolean;
      widgetIsOpen?: boolean;
    };
  }
}

export function SupportWidget({
  accountId,
  baseUrl,
  email,
  name,
  metadata,
  metadataToken,
  primaryColor,
  controlledByHost,
  widgetIsOpen,
  onClose,
}: SupportWidgetProps) {
  useEffect(() => {
    if (controlledByHost && window.SupportWidget) {
      window.SupportWidget.widgetIsOpen = widgetIsOpen;
    }
  }, [controlledByHost, widgetIsOpen]);

  useEffect(() => {
    if (!controlledByHost || !onClose) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "sw:close") {
        onClose();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [controlledByHost, onClose]);

  useEffect(() => {
    window.SupportWidget = {
      accountId,
      email,
      name,
      metadata,
      metadataToken,
      primaryColor,
      controlledByHost,
      widgetIsOpen,
    };

    const scriptId = "support-widget-loader";
    if (document.getElementById(scriptId)) {
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `${baseUrl}/widget/loader.js`;
    script.async = true;
    document.body.appendChild(script);
  }, [
    accountId,
    baseUrl,
    email,
    name,
    metadata,
    metadataToken,
    primaryColor,
    controlledByHost,
    widgetIsOpen,
  ]);

  return null;
}
