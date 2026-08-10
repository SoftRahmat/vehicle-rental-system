export const RENTAL_LOCATIONS = [
  "Downtown Hub",
  "Airport Hub",
  "Central Station",
] as const;

export const INSURANCE_PLANS = {
  none: { label: "No additional coverage", dailyRate: 0 },
  standard: { label: "Standard protection", dailyRate: 12 },
  premium: { label: "Premium protection", dailyRate: 22 },
} as const;

export const RENTAL_ADD_ONS = {
  gps: { label: "GPS navigation", dailyRate: 7 },
  child_seat: { label: "Child seat", dailyRate: 9 },
  additional_driver: { label: "Additional driver", dailyRate: 15 },
} as const;

export const TAX_RATE = 0.08;
export const SECURITY_DEPOSIT = 200;
export const PROMO_CODES = { ROADLY10: 0.1 } as const;

export type InsurancePlan = keyof typeof INSURANCE_PLANS;
export type RentalAddOn = keyof typeof RENTAL_ADD_ONS;

export type RentalSelection = {
  pickupLocation?: string | undefined;
  returnLocation?: string | undefined;
  pickupTime?: string | undefined;
  returnTime?: string | undefined;
  insurancePlan?: string | undefined;
  addOns?: string[] | undefined;
  specialRequests?: string | undefined;
  promoCode?: string | undefined;
};

export type NormalizedRentalSelection = {
  pickupLocation: string;
  returnLocation: string;
  pickupTime: string;
  returnTime: string;
  insurancePlan: InsurancePlan;
  addOns: RentalAddOn[];
  specialRequests: string;
  promoCode: string;
};

export type PricingBreakdown = {
  basePrice: number;
  insuranceFee: number;
  addOnsFee: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  depositAmount: number;
  totalPrice: number;
};

const money = (value: number): number => Number(value.toFixed(2));

export const normalizeRentalSelection = (
  input: RentalSelection,
): NormalizedRentalSelection => {
  const pickupLocation = input.pickupLocation?.trim() || RENTAL_LOCATIONS[0];
  const returnLocation = input.returnLocation?.trim() || pickupLocation;
  if (
    !RENTAL_LOCATIONS.includes(
      pickupLocation as (typeof RENTAL_LOCATIONS)[number],
    )
  ) {
    const error: any = new Error("Invalid pickup location");
    error.status = 400;
    throw error;
  }
  if (
    !RENTAL_LOCATIONS.includes(
      returnLocation as (typeof RENTAL_LOCATIONS)[number],
    )
  ) {
    const error: any = new Error("Invalid return location");
    error.status = 400;
    throw error;
  }

  const pickupTime = input.pickupTime || "09:00";
  const returnTime = input.returnTime || "17:00";
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(pickupTime) || !timePattern.test(returnTime)) {
    const error: any = new Error(
      "Pickup and return times must use HH:mm format",
    );
    error.status = 400;
    throw error;
  }

  const insurancePlan = (input.insurancePlan || "none") as InsurancePlan;
  if (!(insurancePlan in INSURANCE_PLANS)) {
    const error: any = new Error("Invalid insurance plan");
    error.status = 400;
    throw error;
  }

  const addOns = [...new Set(input.addOns ?? [])] as RentalAddOn[];
  if (addOns.some((code) => !(code in RENTAL_ADD_ONS))) {
    const error: any = new Error("One or more rental add-ons are invalid");
    error.status = 400;
    throw error;
  }

  const promoCode = input.promoCode?.trim().toUpperCase() ?? "";
  if (promoCode && !(promoCode in PROMO_CODES)) {
    const error: any = new Error("Promo code is not valid");
    error.status = 400;
    throw error;
  }

  const specialRequests = input.specialRequests?.trim().slice(0, 500) ?? "";
  return {
    pickupLocation,
    returnLocation,
    pickupTime,
    returnTime,
    insurancePlan,
    addOns,
    specialRequests,
    promoCode,
  };
};

export const calculatePricing = (
  dailyRate: number,
  days: number,
  selection: NormalizedRentalSelection,
): PricingBreakdown => {
  const basePrice = money(dailyRate * days);
  const insuranceFee = money(
    INSURANCE_PLANS[selection.insurancePlan].dailyRate * days,
  );
  const addOnsFee = money(
    selection.addOns.reduce(
      (total, code) => total + RENTAL_ADD_ONS[code].dailyRate,
      0,
    ) * days,
  );
  const subtotal = money(basePrice + insuranceFee + addOnsFee);
  const discountRate = selection.promoCode
    ? PROMO_CODES[selection.promoCode as keyof typeof PROMO_CODES]
    : 0;
  const discountAmount = money(subtotal * discountRate);
  const taxableAmount = money(subtotal - discountAmount);
  const taxAmount = money(taxableAmount * TAX_RATE);
  const depositAmount = SECURITY_DEPOSIT;
  const totalPrice = money(taxableAmount + taxAmount + depositAmount);

  return {
    basePrice,
    insuranceFee,
    addOnsFee,
    discountAmount,
    taxableAmount,
    taxAmount,
    depositAmount,
    totalPrice,
  };
};

export const rentalOptions = {
  locations: RENTAL_LOCATIONS,
  insurancePlans: Object.entries(INSURANCE_PLANS).map(([code, value]) => ({
    code,
    ...value,
  })),
  addOns: Object.entries(RENTAL_ADD_ONS).map(([code, value]) => ({
    code,
    ...value,
  })),
  taxRate: TAX_RATE,
  securityDeposit: SECURITY_DEPOSIT,
  promoCodes: Object.keys(PROMO_CODES),
};
