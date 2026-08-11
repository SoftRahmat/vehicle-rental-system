import config from "../../config";
import { prisma } from "../../lib/prisma";
import type { Coordinate, RideServiceType } from "./ride.types";

const appError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });

const radians = (value: number) => (value * Math.PI) / 180;

const haversineMeters = (from: Coordinate, to: Coordinate): number => {
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
};

const assertValidCoordinate = ({ lat, lng }: Coordinate) => {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw appError("A valid pickup and drop-off location is required", 400);
  }
};

const assertInsideServiceZone = async (point: Coordinate) => {
  const zones = await prisma.serviceZone.findMany({ where: { active: true } });
  const inside = zones.some(
    (zone) =>
      haversineMeters(point, {
        lat: Number(zone.centerLat),
        lng: Number(zone.centerLng),
      }) <=
      Number(zone.radiusKm) * 1_000,
  );
  if (!inside) {
    throw appError(
      "This location is outside Roadly's Kuala Lumpur service area",
      400,
    );
  }
};

const googleRoute = async (
  origin: Coordinate,
  destination: Coordinate,
  serviceType: RideServiceType,
) => {
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleMapsServerKey as string,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
        },
        destination: {
          location: {
            latLng: { latitude: destination.lat, longitude: destination.lng },
          },
        },
        travelMode: serviceType === "bike" ? "TWO_WHEELER" : "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    },
  );
  if (!response.ok)
    throw appError("Google could not calculate this route", 502);
  const data = (await response.json()) as {
    routes?: Array<{ distanceMeters?: number; duration?: string }>;
  };
  const route = data.routes?.[0];
  const durationSeconds = Number(route?.duration?.replace("s", ""));
  if (!route?.distanceMeters || !Number.isFinite(durationSeconds)) {
    throw appError("No drivable route was found between these locations", 400);
  }
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: Math.round(durationSeconds),
    provider: "google_routes",
  };
};

const estimatedRoute = (origin: Coordinate, destination: Coordinate) => {
  const directDistance = haversineMeters(origin, destination);
  const distanceMeters = Math.max(500, Math.round(directDistance * 1.28));
  return {
    distanceMeters,
    durationSeconds: Math.max(180, Math.round(distanceMeters / 7.5)),
    provider: "local_estimate",
  };
};

const calculateRoute = async (
  origin: Coordinate,
  destination: Coordinate,
  serviceType: RideServiceType,
) => {
  assertValidCoordinate(origin);
  assertValidCoordinate(destination);
  await Promise.all([
    assertInsideServiceZone(origin),
    assertInsideServiceZone(destination),
  ]);
  if (haversineMeters(origin, destination) < 150) {
    throw appError(
      "Pickup and drop-off must be at least 150 metres apart",
      400,
    );
  }
  if (config.googleMapsServerKey)
    return googleRoute(origin, destination, serviceType);
  if (config.nodeEnv === "production") {
    throw appError("Ride routing is not configured", 503);
  }
  return estimatedRoute(origin, destination);
};

export const routingService = { calculateRoute };
