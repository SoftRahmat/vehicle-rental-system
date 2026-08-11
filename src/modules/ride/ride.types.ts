export const rideServiceTypes = ["bike", "car", "xl"] as const;
export type RideServiceType = (typeof rideServiceTypes)[number];

export const rideStatuses = [
  "requested",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
  "completed",
  "customer_cancelled",
  "admin_cancelled",
  "no_driver_available",
] as const;
export type RideStatus = (typeof rideStatuses)[number];

export type Coordinate = { lat: number; lng: number };

export type RideQuoteRequest = {
  serviceType: RideServiceType;
  pickup: Coordinate & { address: string };
  dropoff: Coordinate & { address: string };
  promoCode?: string;
  paymentMethod?: "card" | "cash";
};

export type RideQuoteToken = RideQuoteRequest & {
  purpose: "ride_quote";
  passengerId: number;
  distanceMeters: number;
  durationSeconds: number;
  currency: string;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  bookingFee: number;
  discountAmount: number;
  promoCodeId: number | null;
  estimatedFare: number;
  routingProvider: string;
  paymentMethod: "card" | "cash";
};
