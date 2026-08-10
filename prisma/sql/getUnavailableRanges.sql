-- @param {Int} $1:vehicleId
SELECT
  TO_CHAR(rent_start_date, 'YYYY-MM-DD') AS start_date,
  TO_CHAR(rent_end_date, 'YYYY-MM-DD') AS end_date
FROM bookings
WHERE vehicle_id = $1
  AND status = 'active'
  AND rent_end_date >= CURRENT_DATE
ORDER BY rent_start_date ASC;
