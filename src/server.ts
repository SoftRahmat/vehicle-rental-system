import app from "./app";
import config from "./config";
import { createServer } from "http";
import { realtimeGateway } from "./modules/realtime/realtime.gateway";

const port = config.port;

const server = createServer(app);
realtimeGateway.initialize(server);

server.listen(port, () => {
  console.log(`Vehicle Rental System server is running on port ${port}`);
});
