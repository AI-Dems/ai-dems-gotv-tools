-- Feeds the `locations` tab of the Polling Location Priority sheet from a
-- Redshift / Civis Platform warehouse. Output columns match docs/data-contract.md.
--
-- EDIT ONLY THE `voters` CTE. It must return one row per registered voter:
--   location_name, city, county, address, precinct   (text)
--   turnout                                           (0–1: chance they vote)
--   support                                           (0–1: chance they vote for us, if they vote)
--
-- Then run, export as CSV, and paste over the `locations` tab (header
-- included). Run Polling Priority → Recompute priority afterwards.
--
-- Replace the schema.table names and the score column names below.

WITH voters AS (
  SELECT
    pl.polling_location AS location_name,
    pl.polling_city     AS city,
    p.county_name       AS county,
    pl.polling_address  AS address,
    pl.precinct_name    AS precinct,
    COALESCE(s.TURNOUT_SCORE_COLUMN, 0) AS turnout,
    COALESCE(s.SUPPORT_SCORE_COLUMN, 0) AS support
  FROM schema.voterfile AS p
  INNER JOIN schema.polling_locations AS pl ON pl.van_precinct_id = p.van_precinct_id
  LEFT JOIN schema.scores AS s ON s.person_id = p.person_id
  WHERE p.reg_voter_flag = TRUE
)

-- ---- nothing below needs editing ----------------------------------------------

SELECT
  location_name,
  city,
  ROUND(SUM(turnout), 1)           AS likely_voters,
  ROUND(SUM(turnout * support), 1) AS likely_supporters,
  COUNT(*)                         AS registered,
  LISTAGG(DISTINCT precinct, ', ') WITHIN GROUP (ORDER BY precinct) AS precincts,
  MAX(address)                     AS address,
  MAX(county)                      AS county
FROM voters
WHERE location_name IS NOT NULL AND location_name <> ''
GROUP BY location_name, city
ORDER BY 2 * SUM(turnout * support) - SUM(turnout) DESC
