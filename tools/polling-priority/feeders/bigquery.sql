-- Feeds the `locations` tab of the Polling Location Priority sheet from a
-- BigQuery warehouse. Output columns match docs/data-contract.md exactly.
--
-- EDIT ONLY THE `voters` CTE. It must return one row per registered voter:
--   location_name, city, county, address, precinct   (text)
--   turnout                                           (0–1: chance they vote)
--   support                                           (0–1: chance they vote for us, if they vote)
--
-- Then run, export as CSV, and paste over the `locations` tab (header
-- included). Run Polling Priority → Recompute priority afterwards.
--
-- The example below is for a DSCC/DNC-style warehouse where polling places
-- come from a VAN sync and scores sit in a separate table keyed by person_id.
-- Replace the backticked table names and the score column names.

WITH polling_places AS (
  -- Most recently authenticated polling place for each precinct.
  SELECT van_precinct_id, precinct_name, polling_location, polling_address, polling_city
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY van_precinct_id ORDER BY date_polling_location_authenticated DESC) AS rn
    FROM `PROJECT.vansync.polling_locations`
  )
  WHERE rn = 1
),

voters AS (
  SELECT
    pl.polling_location AS location_name,
    pl.polling_city     AS city,
    p.county_name       AS county,
    pl.polling_address  AS address,
    pl.precinct_name    AS precinct,
    COALESCE(s.TURNOUT_SCORE_COLUMN, 0) AS turnout,
    COALESCE(s.SUPPORT_SCORE_COLUMN, 0) AS support
  FROM `PROJECT.DATASET.person` AS p
  INNER JOIN polling_places AS pl USING (van_precinct_id)
  LEFT JOIN `PROJECT.DATASET.scores` AS s USING (person_id)
  WHERE p.reg_voter_flag = TRUE
)

-- ---- nothing below needs editing ----------------------------------------------

SELECT
  location_name,
  city,
  ROUND(SUM(turnout), 1)           AS likely_voters,
  ROUND(SUM(turnout * support), 1) AS likely_supporters,
  COUNT(*)                         AS registered,
  STRING_AGG(DISTINCT precinct, ', ' ORDER BY precinct) AS precincts,
  MAX(address)                     AS address,   -- MAX skips the few voters with a blank
  MAX(county)                      AS county
FROM voters
WHERE location_name IS NOT NULL AND location_name != ''
GROUP BY location_name, city
ORDER BY 2 * SUM(turnout * support) - SUM(turnout) DESC
