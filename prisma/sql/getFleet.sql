-- @param {DateTime} $1:startDate?
-- @param {DateTime} $2:endDate?
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
  v.updated_at,
  CASE
    WHEN $1::date IS NULL THEN v.availability_status = 'available'
    ELSE NOT EXISTS (
      SELECT 1
      FROM bookings b
      WHERE b.vehicle_id = v.id
        AND b.status = 'active'
        AND NOT (b.rent_end_date < $1::date OR b.rent_start_date > $2::date)
    )
  END AS available_for_period,
  (
    SELECT TO_CHAR(MAX(b.rent_end_date) + 1, 'YYYY-MM-DD')
    FROM bookings b
    WHERE b.vehicle_id = v.id
      AND b.status = 'active'
      AND b.rent_end_date >= CURRENT_DATE
  ) AS next_available_date
FROM vehicles v
ORDER BY v.id;
