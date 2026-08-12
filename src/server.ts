import app from "./app";
import config from "./config";
import { createServer } from "http";
import { realtimeGateway } from "./modules/realtime/realtime.gateway";
import { rideService } from "./modules/ride/ride.service";

const port = config.port;

const server = createServer(app);
realtimeGateway.initialize(server);

server.listen(port, () => {
  console.log(`Vehicle Rental System server is running on port ${port}`);
});

setInterval(() => {
  void rideService
    .expireRideOffers()
    .then((rides) => rides.forEach((ride) => realtimeGateway.publishRide(ride)))
    .catch(console.error);
}, 3_000).unref();
