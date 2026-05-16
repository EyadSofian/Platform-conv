import { createServer } from "node:http";
import { Server } from "socket.io";
import type { RealtimeEvent } from "./src/types/platform";

const port = Number(process.env.SOCKET_PORT ?? 3001);
const secret = process.env.SOCKET_INTERNAL_SECRET ?? "local-socket-secret";

const httpServer = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && request.url === "/emit") {
    if (request.headers["x-socket-secret"] !== secret) {
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

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
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

httpServer.listen(port, () => {
  console.log(`[socket] listening on http://localhost:${port}`);
});
