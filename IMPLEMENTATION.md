# Implementation Notes — Tasks 1, 2, 3 & 4

## Overview

Tasks 1–4 are built as a unified CRUD layer with pagination on top of the existing read-only Employee Directory. All four share a single, consistent design philosophy:

- **One form panel** handles both Add and Edit (no duplicated HTML).
- **One modal** handles the Delete confirmation.
- All mutations follow the same **Request → Validate → Persist → Refresh** flow.
- No new CSS frameworks or libraries were introduced — every new element reuses the existing class vocabulary.

---

## Task 1 — Add Employee

### Backend: `POST /api/employees`

**Data flow:**
```
Client submits form
  → POST /api/employees  { name, department, position, email, phone, hire_date, salary }
    → server validates all 7 required fields (400 if any missing)
    → INSERT INTO employees (...)
      → UNIQUE violation on email  → 409 Conflict  { error: "Email already exists" }
      → success                   → 201 Created    { id: <new_id> }
```

Key decisions:
- Server-side validation is authoritative — the API is safe to call directly, not just from the browser.
- SQLite `UNIQUE` constraint errors are caught explicitly and surfaced as `409 Conflict` rather than letting a 500 bubble up, giving the frontend a meaningful status code to branch on.

### Frontend

- **"Add Employee"** button in the toolbar calls `showAddForm()`, which sets the form to add mode (clears `fEditId`, sets title to "Add New Employee", button text to "Save Employee") and scrolls the panel into view.
- Department `<select>` is populated live from `GET /api/departments` — no hardcoded values, so new departments added via other means appear automatically.
- On `201` response: panel closes, `loadEmployees()` re-fetches and re-renders the table and stats.
- On `4xx` response: error text from `data.error` is displayed inline in `#formMessage` without closing the form.

---

## Task 2 — Edit Employee

### Backend: `PUT /api/employees/:id`

**Data flow:**
```
Client submits form (edit mode)
  → PUT /api/employees/:id  { name, department, position, email, phone, hire_date, salary }
    → server validates all 7 required fields (400 if any missing)
    → UPDATE employees SET ... WHERE id = ?
      → changes === 0  → 404 Not Found    { error: "Employee not found" }
      → UNIQUE email   → 409 Conflict     { error: "Email already exists" }
      → success        → 200 OK           { success: true }
```

Validation logic is identical to `POST` — both routes share the same field-check pattern, making them easy to reason about together.

### Frontend

- Each table row has an **"Edit"** button that calls `openEditForm(id)`.
- Employee data is read from the in-memory `allEmployees` array (already populated by `loadEmployees()`), so opening the edit form requires **zero additional network requests**.
- `populateFormDepts(selected)` rebuilds the department dropdown and pre-selects the employee's current department.
- On success: same as add — panel closes, table reloads.

---

## Task 3 — Delete Employee

### Backend: `DELETE /api/employees/:id`

**Data flow:**
```
User confirms deletion
  → DELETE /api/employees/:id
    → DELETE FROM employees WHERE id = ?
      → changes === 0  → 404 Not Found  { error: "Employee not found" }
      → success        → 200 OK         { success: true }
```

The route is intentionally minimal — no request body, no validation beyond checking that the row existed.

### Frontend

Delete is a two-stage interaction to prevent accidental data loss:

**Stage 1 — Trigger:**
- Each table row has a **"Delete"** button (`.btn-delete`, styled in `#c2185b` to match the existing error palette).
- Clicking it calls `deleteEmployee(id, name)`, which:
  1. Injects the employee's name into `#modalTitle` ("Delete "Jane Doe"?") so the user sees exactly what they are about to remove.
  2. Binds `confirmDelete(id)` to the modal's confirm button via `onclick` reassignment — the id is captured in closure, not stored in the DOM.
  3. Adds the `.active` class to `#deleteModal`, making the overlay visible via `display: flex`.

**Stage 2 — Confirm or Cancel:**
- **Cancel** (`hideDeleteModal`): removes `.active`, modal disappears, no network call is made.
- **Confirm** (`confirmDelete`):
  1. Dismisses the modal immediately (before the network call) so the UI feels responsive.
  2. Calls `DELETE /api/employees/:id`.
  3. On success: `loadEmployees()` refreshes the table and all three stat cards.
  4. On failure: falls back to `alert()` with the server's error message.

**Modal structure:**
```
.modal-overlay#deleteModal           ← fixed overlay, covers full viewport (inset: 0), z-index 100
  └── .modal                         ← centered card, max-width 400px
        ├── h3#modalTitle            ← "Delete '<name>'?" — injected at open time
        ├── p#modalBody              ← "This action cannot be undone."
        └── .form-actions
              ├── .btn-secondary     ← Cancel
              └── .btn-delete        ← Delete (confirm)
```

The modal is placed **outside `.container`** so the overlay fills the full viewport regardless of scroll position. `.active` is toggled rather than using `display` inline style, keeping all visibility logic in CSS.

---

## Key Design Decisions

### 1. Single shared form for Add and Edit

Instead of writing two separate form panels with duplicate HTML, Tasks 1 and 2 share one `#employeeFormPanel`. A hidden `<input id="fEditId">` acts as the mode flag:

| `fEditId` value | Mode | HTTP method | Endpoint |
|---|---|---|---|
| empty string | Add | `POST` | `/api/employees` |
| numeric ID | Edit | `PUT` | `/api/employees/:id` |

The form title and submit button text are updated dynamically when the panel opens. Any future field change only needs to be made in one place.

### 2. Department is a `<select>`, not free-text

Department name is used for filtering (toolbar), grouping (Task 5 pie chart), and badge coloring. Allowing free-text input risks inconsistencies like `"Engineering"` vs `"engineering dept"` being treated as separate departments. A `<select>` populated from `GET /api/departments` enforces referential consistency without adding a separate departments table.

### 3. Confirmation modal instead of `window.confirm()`

The browser's native `confirm()` dialog is synchronous, blocks the main thread, and cannot be styled. The custom modal:
- Is visually consistent with the rest of the UI.
- Displays the employee's name in the prompt, reducing the risk of accidental deletion.
- Wires up the confirm action via `onclick` reassignment at open time — no stale IDs, no data attributes needed on the DOM.

### 4. Consistent mutation response pattern

All three write endpoints follow the same frontend pattern after a successful response:

```
res.ok → close panel / modal → loadEmployees()
```

`loadEmployees()` is the single source of truth for table state and stat card values. Funneling all post-mutation refreshes through it means the counts and averages are always in sync without any local state management.

### 5. No modifications to existing routes or layout

All additions are purely additive. Existing `GET /api/employees` and `GET /api/departments` routes are unchanged. The table header gains one `Actions` column, and `updateSortHeaders()` has a one-line null guard (`if (!icon) return`) to safely skip that column since it has no sort icon.

### 6. CSS reuse — no new design primitives

| New element | Reused classes |
|---|---|
| Add / Edit form | `.add-form-panel`, `.form-grid`, `.form-group`, `.btn-primary`, `.btn-secondary`, `.form-message.error` |
| Edit button | `.btn-edit` (one new rule, same color palette as `#0f3460`) |
| Delete button | `.btn-delete` (one new rule, reuses error color `#c2185b`) |
| Modal cancel | `.btn-secondary` |
| Modal confirm | `.btn-delete` |
| Modal layout | `.form-actions` |

The only structurally new CSS blocks are `.btn-delete`, `.modal-overlay`, and `.modal` — all scoped and self-contained.

### 7. Server-side + client-side validation

Required field validation runs on both sides:
- **Client-side**: HTML `required` attributes prevent empty submissions, giving instant feedback without a round trip.
- **Server-side**: Express checks all fields and returns structured error JSON, so the API is safe even when called directly outside the browser.

---

## Task 4 — Pagination

### Approach: client-side slice, no new API

Pagination is implemented entirely on the frontend. The server already returns a filtered and sorted list; the client divides that list into pages using `Array.slice()`. No new query parameters or backend changes were needed.

**Data flow:**
```
User triggers any filter / search / sort
  → loadEmployees() fetches filtered+sorted allEmployees from server
    → currentPage reset to 1
      → renderTable(allEmployees)
          → slice allEmployees[start … start+PAGE_SIZE]
            → inject page rows into <tbody>
              → updatePagination(total) updates Prev/Next state + page indicator

User clicks Previous / Next
  → goToPage(n)
      → updates currentPage (clamped to valid range)
        → renderTable(allEmployees)   ← re-render only, no network call
            → new slice → new <tbody>
              → updatePagination()
```

### State

Two variables added alongside the existing `sortCol` / `sortOrder` / `allEmployees`:

| Variable | Type | Role |
|---|---|---|
| `PAGE_SIZE` | `const number` | Rows per page (5). Declared as `const` — changing one value reconfigures all pagination logic. |
| `currentPage` | `let number` | 1-indexed current page. Reset to `1` every time `loadEmployees()` runs. |

### Functions

**`renderTable(employees)`** — extended (was: render all rows; now: slice first, then render)

1. Computes `totalPages = Math.ceil(total / PAGE_SIZE)`.
2. Clamps `currentPage` down if the filtered result set shrank below the current page (e.g. user narrows search while on page 3).
3. Slices `employees` to `pageRows` for the current page.
4. Renders only `pageRows` into `<tbody>`.
5. Calls `updatePagination(total)`.

**`updatePagination(total)`** — new

- Hides the pagination bar entirely (`display: none`) when `totalPages <= 1` — no unnecessary chrome for small datasets.
- Disables the Previous button on page 1; disables Next on the last page.
- Updates `#pageIndicator` text: `"Page 2 of 4"`.

**`goToPage(page)`** — new

- Clamps the requested page to `[1, totalPages]` — safe to call with `currentPage - 1` on page 1 or `currentPage + 1` on the last page without bounds checks at the call site.
- Calls `renderTable(allEmployees)` directly — no `fetch`, since the full filtered list is already in memory.

### HTML structure

```
.table-wrap
  └── <table> … </table>
  └── .pagination#pagination            ← hidden when totalPages ≤ 1
        ├── #btnPrev  (.btn-secondary)  ← disabled on page 1
        ├── #pageIndicator              ← "Page X of Y"
        └── #btnNext  (.btn-secondary)  ← disabled on last page
```

The pagination bar sits **inside `.table-wrap`** so it appears as a natural footer of the table card, separated by a `1px` border-top. This keeps it visually grouped with the data it controls.

### CSS

Three new rules, all scoped to `.pagination`:

| Rule | Purpose |
|---|---|
| `.pagination { display: none; … }` | Hidden by default; `updatePagination` sets `display: flex` when needed. |
| `.pagination #pageIndicator` | Fixed `min-width: 110px` so the bar doesn't jump width as the page number changes. |
| `.pagination button:disabled` | `opacity: 0.4; pointer-events: none` — dims instead of hides, so bar width is stable at all times. |

### Key design decisions

**Why client-side pagination?**
The server already returns the full filtered+sorted result set to power the existing table. Adding `LIMIT`/`OFFSET` to the SQL would require passing page parameters through the API and coordinating them with search and sort — significant scope for a feature that doesn't improve perceived performance at this data size. Client-side slicing adds ~10 lines of logic for the same user experience.

**Why reset `currentPage` in `loadEmployees()`, not in event listeners?**
Search, department filter, and column sort all funnel through `loadEmployees()`. Resetting in one place ensures that any new data-changing trigger (including future ones) automatically resets the page, rather than requiring each event listener to remember to reset it.

**Why clamp inside `renderTable()` rather than inside `goToPage()`?**
`renderTable` is the only place where page-out-of-bounds can occur from an external cause (a search that reduces the result count while the user is on page 3). Centralising the clamp there means `goToPage` can stay simple and `loadEmployees` doesn't need to know about pagination internals.