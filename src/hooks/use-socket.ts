"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL ??
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3001");
    const client = io(url, { transports: ["websocket", "polling"] });

    client.on("connect", () => setConnected(true));
    client.on("disconnect", () => setConnected(false));
    setSocket(client);

    return () => {
      client.disconnect();
    };
  }, []);

  return { socket, connected };
}
