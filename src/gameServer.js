const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { registerSocketHandlers } = require("./socketHandlers");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../public")));

registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`ShadowVerse NEO is running on port ${PORT}`);
});
