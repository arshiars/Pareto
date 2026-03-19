# CMHC Loans Database Schema

## Table: `cmhc_loans`

KingSett Capital's approved CMHC-insured multi-unit residential loan portfolio.

### Critical formatting rules
- **Ratios stored as decimals**: cap_rate, ltv_net, ltv_gross, opex_ratio, commercial_cap_rate, commercial_opex_ratio, noi_per_debt are stored as decimals. 0.045 = 4.5%, 0.552 = 55.2%. To filter for cap rate above 5%, use `cap_rate > 0.05`. To display, multiply by 100.
- **Currency in CAD**: All dollar amounts are annual CAD unless noted (rents are monthly).
- **Rents are monthly**: bachelor_rent_market, bed1_rent_market, etc. are monthly CAD.
- **Nulls are common**: Many fields are null when data was unavailable. Use `IS NOT NULL` filters and COALESCE/NULLIF to handle gracefully.

### Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | uuid | Primary key | - |
| loan_number | text | KingSett loan ID | 'C1001' |
| fn_loan_number | text | Alliance/FN number | '580000' |
| loan_name | text | Deal name | 'Stationview, Guelph' |
| address | text | Street address | '82-94 Carden Street' |
| city | text | City | 'Guelph' |
| province | text | Province code | 'ON', 'BC', 'QC', 'AB', 'MB', 'SK', 'NS', 'NB' |
| region | text | KingSett region | 'No Region' |
| asset_type | text | Property type | 'Residential', 'Residential/Retail' |
| year_built | integer | Year constructed | 1969 |
| funding_date | date | Loan funding date | '2022-03-30' |
| units | integer | Total residential units | 51 |
| gross_loan | numeric | Gross loan (CAD) | 3953774 |
| net_loan | numeric | Net loan (CAD) | 2600000 |
| commercial_net_loan | numeric | Commercial net loan (CAD) | 702047 |
| ltv_net | numeric | Net LTV **decimal** | 0.552 → 55.2% |
| ltv_gross | numeric | Gross LTV **decimal** | 0.541 → 54.1% |
| residential_ks_value | numeric | KS appraised value (CAD) | 6052473 |
| ks_value_per_unit | numeric | KS value per unit (CAD) | 118675 |
| cap_rate | numeric | Cap rate **decimal** | 0.045 → 4.5% |
| commercial_cap_rate | numeric | Commercial cap rate **decimal** | 0.07 → 7.0% |
| noi | numeric | Net operating income (CAD/yr) | 350219 |
| noi_per_debt | numeric | NOI / debt **decimal** | 0.089 |
| egi | numeric | Effective gross income (CAD/yr) | 482236 |
| operating_expenses | numeric | Total OpEx (CAD/yr) | 209875 |
| opex_ratio | numeric | OpEx/EGI **decimal** | 0.435 → 43.5% |
| opex_per_unit | numeric | Annual OpEx per unit (CAD) | 4115 |
| dsc_net | numeric | Debt service coverage — net | 1.41 |
| dsc_gross | numeric | Debt service coverage — gross | 1.28 |
| property_tax | numeric | Annual property tax (CAD) | 92026 |
| insurance | numeric | Annual insurance (CAD) | 22960 |
| utilities | numeric | Annual utilities (CAD) | 69652 |
| pt_per_unit | numeric | Property tax per unit (CAD/yr) | 1804 |
| insurance_per_unit | numeric | Insurance per unit (CAD/yr) | 450 |
| utilities_per_unit | numeric | Utilities per unit (CAD/yr) | 1365 |
| bachelor_rent_market | numeric | Monthly market rent — bachelor (CAD) | 750 |
| bachelor_rent_affordable | numeric | Monthly affordable rent — bachelor (CAD) | 600 |
| bachelor_sqft_market | numeric | Sqft — market bachelor | 422 |
| bachelor_sqft_affordable | numeric | Sqft — affordable bachelor | 400 |
| bachelor_psf_market | numeric | PSF — market bachelor | 2.01 |
| bachelor_psf_affordable | numeric | PSF — affordable bachelor | 1.80 |
| bed1_rent_market | numeric | Monthly market rent — 1BR (CAD) | 811 |
| bed1_rent_affordable | numeric | Monthly affordable rent — 1BR (CAD) | 650 |
| bed1_sqft_market | numeric | Sqft — market 1BR | 500 |
| bed1_sqft_affordable | numeric | Sqft — affordable 1BR | 480 |
| bed1_psf_market | numeric | PSF — market 1BR | 1.62 |
| bed1_psf_affordable | numeric | PSF — affordable 1BR | 1.40 |
| bed2_rent_market | numeric | Monthly market rent — 2BR (CAD) | 892 |
| bed2_rent_affordable | numeric | Monthly affordable rent — 2BR (CAD) | 750 |
| bed2_sqft_market | numeric | Sqft — market 2BR | 650 |
| bed2_sqft_affordable | numeric | Sqft — affordable 2BR | 620 |
| bed2_psf_market | numeric | PSF — market 2BR | 1.37 |
| bed2_psf_affordable | numeric | PSF — affordable 2BR | 1.20 |
| bed3_rent_market | numeric | Monthly market rent — 3BR (CAD) | 1100 |
| bed3_rent_affordable | numeric | Monthly affordable rent — 3BR (CAD) | 900 |
| bed3_sqft_market | numeric | Sqft — market 3BR | 900 |
| bed3_sqft_affordable | numeric | Sqft — affordable 3BR | 850 |
| bed3_psf_market | numeric | PSF — market 3BR | 1.22 |
| bed3_psf_affordable | numeric | PSF — affordable 3BR | 1.06 |
| bed4plus_rent_market | numeric | Monthly market rent — 4BR+ (CAD) | 1400 |
| bed4plus_rent_affordable | numeric | Monthly affordable rent — 4BR+ (CAD) | 1100 |
| bed4plus_sqft_market | numeric | Sqft — market 4BR+ | 1100 |
| bed4plus_sqft_affordable | numeric | Sqft — affordable 4BR+ | 1050 |
| bed4plus_psf_market | numeric | PSF — market 4BR+ | 1.27 |
| bed4plus_psf_affordable | numeric | PSF — affordable 4BR+ | 1.05 |
| townhouse_rent_market | numeric | Monthly market rent — townhouse (CAD) | 1800 |
| townhouse_rent_affordable | numeric | Monthly affordable rent — townhouse (CAD) | 1400 |
| townhouse_sqft | numeric | Sqft — townhouse | 1200 |
| townhouse_psf_market | numeric | PSF — market townhouse | 1.50 |
| townhouse_psf_affordable | numeric | PSF — affordable townhouse | 1.17 |
| commercial_area | numeric | Commercial area (sqft) | 9195 |
| commercial_value | numeric | Commercial appraised value (CAD) | 1112258 |
| commercial_value_per_area | numeric | Commercial value per sqft (CAD/sf) | 120.96 |
| commercial_egi | numeric | Commercial EGI (CAD/yr) | 169808 |
| commercial_opex | numeric | Commercial OpEx (CAD/yr) | 91950 |
| commercial_opex_ratio | numeric | Commercial OpEx ratio **decimal** | 0.541 → 54.1% |
| commercial_rent | numeric | Total commercial rent (CAD/yr) | 188676 |
| commercial_rate | numeric | Commercial rate (CAD/sf/yr) | 20.52 |
| comments | text | Deal notes | 'Mixed-use retail podium' |
| created_at | timestamptz | Record inserted | - |

### Common query patterns

```sql
-- Average cap rate by province
SELECT province, ROUND(AVG(cap_rate) * 100, 2) AS avg_cap_rate_pct, COUNT(*) AS deal_count
FROM cmhc_loans WHERE cap_rate IS NOT NULL GROUP BY province ORDER BY avg_cap_rate_pct DESC;

-- Deals with highest property tax per unit
SELECT loan_name, city, province, units, ROUND(pt_per_unit) AS pt_per_unit
FROM cmhc_loans WHERE pt_per_unit IS NOT NULL ORDER BY pt_per_unit DESC;

-- Portfolio exposure by province
SELECT province, COUNT(*) AS deals, ROUND(SUM(net_loan)/1e6, 1) AS total_net_loan_M
FROM cmhc_loans GROUP BY province ORDER BY total_net_loan_M DESC;

-- Deals funded in a given year
SELECT loan_name, city, province, funding_date, net_loan
FROM cmhc_loans WHERE EXTRACT(YEAR FROM funding_date) = 2022 ORDER BY funding_date;

-- Cap rate above threshold
SELECT loan_name, city, province, ROUND(cap_rate * 100, 2) AS cap_rate_pct
FROM cmhc_loans WHERE cap_rate > 0.05 ORDER BY cap_rate DESC;
```
