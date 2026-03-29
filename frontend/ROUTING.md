# Routing & URL Conventions

## Stack

- **React Router v7** (`react-router-dom`) with `BrowserRouter`
- All routes defined in `src/App.jsx`
- Slug utilities in `src/utils/slug.js` (`slugify`, `matchesSlug`)

## Golden Rules

1. **Never put database IDs (UUIDs, integers) in URLs.** Use human-readable slugs derived from names or addresses.
2. **Slugs are cosmetic, not primary keys.** The app resolves slugs back to IDs by matching against loaded data — the slug is never sent to the API directly.
3. **Use `slugify()` to generate URL slugs** and `matchesSlug()` to resolve them. Both live in `src/utils/slug.js`.
4. **Wildcard sub-routing**: Features with multiple views (e.g. Triple-C, Rent Comparables) use a single `/*` route in `App.jsx` and handle sub-routing internally via `useLocation()`.

## Route Map

| URL | Component | Notes |
|-----|-----------|-------|
| `/` | `SelectionPage` | Home / tool picker |
| `/cmhc` | `AppContent` (wrapped in `AnalysisProvider`) | CMHC underwriting workflow (upload → review → excel) |
| `/conventional` | `ConventionalPage` | Conventional financing hub |
| `/conventional/ipp` | `IPPPage` | IPP analysis tool |
| `/cmhc-database` | `CMHCDatabasePage` | Loan database list |
| `/cmhc-database/:slug` | `CMHCDatabasePage` | Loan detail — slug from `slugify(address + city)` |
| `/comparable-analysis` | `ComparableAnalysisPage` | Comparable analysis hub |
| `/comparable-analysis/rent-comparables/*` | `RentComparablesPage` | Sub-routes handled internally |
| `/triple-c/*` | `TripleCApp` | Sub-routes handled internally |
| `*` | Redirects to `/` | Catch-all |

## Slug Pattern (How It Works)

This is the standard pattern used across the app. Follow it for any new feature that links to a detail page.

### 1. Navigate to detail page

When the user clicks an item in a list, generate a slug from the display name and navigate:

```jsx
import { slugify } from '../utils/slug.js'

navigate(`/feature/item/${slugify(item.name)}`)
// e.g. /cmhc-database/456-oak-avenue-toronto
// e.g. /triple-c/project/elevate-condos
```

Store the item's database ID in component state so it's available immediately.

### 2. Resolve slug on refresh / direct navigation

When the page loads from a URL (refresh, shared link, back button), there's no state — resolve the slug by fetching the list and matching:

```jsx
import { matchesSlug } from '../utils/slug.js'

useEffect(() => {
  if (!slug || alreadyResolved) return

  fetchItems().then((items) => {
    const match = items.find((i) => matchesSlug(i.name, slug))
    if (match) {
      setSelectedId(match.id)
    } else {
      navigate('/feature', { replace: true }) // slug not found, go back to list
    }
  })
}, [slug])
```

### 3. Pass the resolved ID to the detail component

The detail component receives a database ID (UUID) as a prop and fetches its own data. It never sees or cares about the slug.

```jsx
<DetailPage itemId={selectedId} />
```

## Sub-Routing Pattern (Wildcard Features)

Features like Triple-C and Rent Comparables manage their own internal views. The pattern:

1. **App.jsx** registers a single wildcard route: `<Route path="/feature/*" element={<FeatureApp />} />`
2. **FeatureApp** reads `useLocation().pathname`, strips the base path, and derives the current view:

```jsx
const pathSuffix = location.pathname.replace('/feature', '').replace(/^\//, '')
const view = pathSuffix === 'upload' ? 'upload'
  : pathSuffix.startsWith('item/') ? 'detail'
  : 'list'
```

3. Conditionally render the appropriate sub-page based on `view`.

## Current Sub-Routes

### Triple-C (`/triple-c/*` → `TripleCApp.jsx`)

| URL | View |
|-----|------|
| `/triple-c` | Database list |
| `/triple-c/upload` | File upload |
| `/triple-c/review` | Review extracted data |
| `/triple-c/edit` | Edit existing project |
| `/triple-c/project/:name-slug` | Project detail |
| `/triple-c/analytics` | Analytics dashboard |
| `/triple-c/compare` | Compare projects |

### Rent Comparables (`/comparable-analysis/rent-comparables/*` → `RentComparablesPage.jsx`)

| URL | View |
|-----|------|
| `/comparable-analysis/rent-comparables` | Map view |
| `/comparable-analysis/rent-comparables/history` | Search history |
| `/comparable-analysis/rent-comparables/property/:address-slug` | Property detail |

## Adding a New Feature With Detail Pages

1. Add route in `App.jsx` — use `/*` wildcard if the feature has multiple views
2. Generate slugs with `slugify(displayName)` when navigating
3. Resolve slugs with `matchesSlug()` against fetched data on mount
4. Never expose IDs in URLs
5. Use `{ replace: true }` when redirecting away from an invalid slug
