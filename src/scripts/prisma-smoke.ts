import { prisma } from "../lib/prisma";
import { adminService } from "../modules/admin/admin.service";
import { bookingService } from "../modules/booking/booking.service";
import { userService } from "../modules/user/user.service";
import { vehicleService } from "../modules/vehicle/vehicle.service";
import { supportService } from "../modules/support/support.service";

const run = async (): Promise<void> => {
  const [users, vehicles, bookings, supportTickets] = await Promise.all([
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.booking.count(),
    prisma.supportTicket.count(),
  ]);
  const [
    fleet,
    userList,
    bookingList,
    adminVehicles,
    adminBookings,
    adminUsers,
    stats,
    supportPage,
  ] = await Promise.all([
    vehicleService.getAllVehicles(),
    userService.getAllUsers(),
    bookingService.getBookings({ id: 0, role: "admin" }),
    adminService.getVehicles({ page: 1, pageSize: 15 }),
    adminService.getBookings({ page: 1, pageSize: 15 }),
    adminService.getUsers({ page: 1, pageSize: 15 }),
    adminService.getDashboardStats(),
    supportService.getAdminTickets({ page: 1, pageSize: 15 }),
  ]);

  if (
    fleet.length !== vehicles ||
    userList.length !== users ||
    bookingList.length !== bookings ||
    adminVehicles.total !== vehicles ||
    adminBookings.total !== bookings ||
    adminUsers.total !== users ||
    stats.vehicles !== vehicles ||
    supportPage.total !== supportTickets
  ) {
    throw new Error("Migrated service totals do not match Prisma model counts");
  }

  if (fleet[0]) {
    await vehicleService.getUnavailableRanges(fleet[0].id);
  }
  console.log(
    `Prisma services verified: ${users} users, ${vehicles} vehicles, ${bookings} bookings, ${supportTickets} support requests.`,
  );
};

run()
  .catch((error) => {
    console.error("Prisma connection verification failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
