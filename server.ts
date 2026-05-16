import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type { RealtimeEvent } from "./src/types/platform";
import { getCampaignQueue } from "./src/lib/campaign-queue";
import { sendCampaignNow } from "./src/services/campaign-service";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const socketSecret = process.env.SOCKET_INTERNAL_SECRET ?? "local-socket-secret";

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/socket-health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === "POST" && request.url === "/socket-emit") {
      if (request.headers["x-socket-secret"] !== socketSecret) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        try {
          const event = JSON.parse(body) as RealtimeEvent;
          if (event.room) {
            io.to(event.room).emit(event.type, event.payload);
          }
          io.emit(event.type, event.payload);
          response.writeHead(202, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true }));
        } catch {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Invalid event body" }));
        }
      });
      return;
    }

    await handle(request, response);
  });

  const io = new Server(server, {
    cors: {
      origin: process.env.NEXTAUTH_URL ?? true,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("conversation:join", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("agent:join", (agentId: string) => {
      socket.join(`agent:${agentId}`);
    });
  });

  const queue = getCampaignQueue();
  if (queue && process.env.CAMPAIGN_EMBEDDED_WORKER !== "false") {
    queue.process(async (job) => sendCampaignNow(job.data.campaignId));
    console.log("[campaign-worker] embedded Bull worker enabled");
  }

  server.listen(port, hostname, () => {
    console.log(`[web] ready on http://${hostname}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
