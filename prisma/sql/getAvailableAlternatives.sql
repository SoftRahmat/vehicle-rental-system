-- @param {Int} $1:vehicleId
-- @param {DateTime} $2:startDate
-- @param {DateTime} $3:endDate
-- @param {Decimal} $4:dailyRate
SELECT
  v.id,
  v.vehicle_name,
  v.type,
  v.registration_number,
  v.daily_rent_price,
  v.availability_status,
  v.image_url,
  v.seats,
  v.transmission,
  v.fuel_type,
  v.location,
  v.rating,
  v.description,
  v.created_at,
  v.updated_at
FROM vehicles v
WHERE v.id <> $1
  AND NOT EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.vehicle_id = v.id
      AND b.status = 'active'
      AND NOT (b.rent_end_date < $2::date OR b.rent_start_date > $3::date)
  )
ORDER BY ABS(v.daily_rent_price - $4), v.id
LIMIT 3;
