# Hapgood Clock

A browser-based employee time clock built for a small restaurant team.

Employees can clock in and out, review recent shifts, and submit correction requests. Managers can review team hours, approve or reject corrections, and generate reports for custom date ranges.

## Live App

https://hapgood-clock.netlify.app

## Features

### Employee experience

- Secure 4-digit PIN login
- Clock in and clock out from any browser
- Live date and time display
- Recent shift history
- Shift duration calculations
- Submit correction requests for completed shifts
- View correction status as pending, approved, or rejected
- Spanish-first employee interface
- English and Spanish language toggle
- Language preference saved in the browser
- Responsive design for phones, tablets, and desktop

### Manager experience

- Separate manager-only dashboard
- English manager interface
- View total team hours
- View totals for each employee
- See who is currently clocked in
- Select a custom report date range
- Quick-select the current week
- Review pending correction requests
- Compare original and requested shift times
- Approve or reject correction requests
- Add an optional manager note
- Approved corrections automatically update reported hours
- Manager account cannot clock in or out

## Tech Stack

- React
- Vite
- Tailwind CSS
- Supabase
- PostgreSQL
- JavaScript
- Netlify

## Project Structure

- public/
- src/
  - App.jsx
  - index.css
  - main.jsx
  - supabaseClient.js
- .env.example
- .gitignore
- index.html
- package.json
- package-lock.json
- vite.config.js
- README.md

## Getting Started

### Prerequisites

Install:

- Node.js 20.19 or newer
- npm
- A Supabase account

### Clone the repository

Run:

    git clone https://github.com/robregan/hapgood-clock.git
    cd hapgood-clock

### Install dependencies

Run:

    npm install

### Configure environment variables

Copy the example file:

    cp .env.example .env.local

Add your Supabase project values to `.env.local`:

    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

Do not commit `.env.local`.

Never expose a Supabase service-role key in the frontend.

### Run locally

Run:

    npm run dev

Vite will display a local address, usually:

    http://localhost:5173

## Available Scripts

Development server:

    npm run dev

Production build:

    npm run build

Preview the production build:

    npm run preview

Run the linter:

    npm run lint

## Database Overview

### employees

Stores employee and manager accounts.

Important fields:

- id
- name
- pin_hash
- role
- can_clock
- active
- created_at

PINs are stored as hashes and are never saved as readable text.

### time_entries

Stores clock-in and clock-out records.

Important fields:

- id
- employee_id
- employee_name
- clock_in
- clock_out
- created_at
- edited_at
- edited_by
- edit_reason

A partial unique index prevents an employee from having more than one open shift.

### shift_correction_requests

Stores employee requests to correct completed shifts.

Important fields:

- id
- time_entry_id
- employee_id
- requested_clock_in
- requested_clock_out
- reason
- status
- reviewed_by
- reviewed_at
- manager_note
- created_at

Only one pending correction request is allowed per shift.

## Database Functions

The browser does not directly modify protected tables. It calls controlled PostgreSQL functions through Supabase RPC.

Current functions include:

- list_active_employees
- verify_employee_pin
- clock_in_employee
- clock_out_employee
- get_employee_entries
- get_manager_hour_totals
- submit_shift_correction
- get_employee_correction_requests
- get_pending_correction_requests
- review_shift_correction

## Correction Workflow

1. An employee selects a completed shift.
2. The employee submits corrected clock-in and clock-out times with a reason.
3. The request appears in the manager dashboard.
4. The manager approves or rejects it.
5. Approval updates the original shift.
6. The correction request remains as an audit record.

Employees cannot directly edit payroll records.

## Security

Current protections include:

- Hashed PINs using PostgreSQL cryptographic functions
- Row Level Security enabled on protected tables
- Restricted direct table permissions
- Server-side PIN verification
- Role-based manager authorization
- Database-level duplicate open-shift prevention
- Manager-only correction approval
- Audit fields for approved edits
- Frontend uses only the Supabase publishable key

A 4-digit PIN is appropriate for a small internal workplace app, but it is not strong authentication for sensitive financial or identity systems.

Recommended future hardening:

- Failed-login rate limiting
- Account lockout after repeated attempts
- Stronger manager authentication
- Formal audit log
- Automated backups
- Session timeout

## Deployment

The app is deployed with Netlify.

Build command:

    npm run build

Publish directory:

    dist

Required Netlify environment variables:

    VITE_SUPABASE_URL
    VITE_SUPABASE_PUBLISHABLE_KEY

Every push to the `main` branch triggers a new deployment.

## Screenshots

Add screenshots to a folder such as `docs/screenshots/`, then reference them in this README.

Example image paths:

- docs/screenshots/employee-dashboard.png
- docs/screenshots/manager-dashboard.png
- docs/screenshots/correction-request.png

## Roadmap

- CSV payroll export
- Manager-created manual time entries
- Employee management screen
- PIN reset workflow
- Payroll-period presets
- Break tracking
- Manager audit history
- Failed-login throttling
- Stronger authentication for managers
- Optional email notifications for correction requests
- Installable Progressive Web App support

## Status

Version 1 is deployed and functional.

Current production workflows include:

- Employee login
- Clock in and clock out
- Spanish and English employee interface
- Recent shift history
- Employee correction requests
- Manager approval and rejection
- Custom date-range reporting
- Team and employee hour totals

## Author

Built by Rob Regan.

GitHub: https://github.com/robregan

## License

This project is currently unlicensed and intended for private or internal workplace use.
