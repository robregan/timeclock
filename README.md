# Hapgood Clock

A lightweight browser-based employee time clock built with React and Supabase.

Employees can sign in with a four-digit PIN, clock in and out, and review their recent shifts. Time entries are stored in a shared Supabase database, allowing the app to work across multiple devices.

## Features

- Employee selection
- Four-digit PIN verification
- Clock in and clock out
- Shared cloud-based time entries
- Recent shift history
- Prevention of duplicate open shifts
- Responsive layout for desktop, tablet, and mobile
- Hashed employee PINs
- Database-backed access controls
- Loading and error states

## Tech Stack

- React
- Vite
- Supabase
- PostgreSQL
- JavaScript
- CSS

## Project Structure

hapgood-clock/
├── public/
├── src/
│ ├── App.jsx
│ ├── App.css
│ ├── supabaseClient.js
│ └── main.jsx
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js 20.19 or newer
- npm
- A Supabase account

### Installation

Clone the repository:

git clone https://github.com/robregan/hapgood-clock.git
cd hapgood-clock

Install the dependencies:

npm install

Create a local environment file:

cp .env.example .env.local

Add your Supabase project credentials to `.env.local`:

VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

Start the development server:

npm run dev

Open the local URL shown in the terminal, usually:

http://localhost:5173

## Environment Variables

The application requires the following environment variables:

| Variable                        | Description                          |
| ------------------------------- | ------------------------------------ |
| `VITE_SUPABASE_URL`             | The URL of the Supabase project      |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The public browser-safe Supabase key |

The `.env.local` file should never be committed to the repository.

The included `.env.example` file documents the required variables without exposing real credentials.

## Database Overview

The app currently uses two primary tables.

### `employees`

Stores employee records.

Important fields include:

- `id`
- `name`
- `pin_hash`
- `active`
- `created_at`

Employee PINs are stored as hashes rather than readable text.

### `time_entries`

Stores employee shifts.

Important fields include:

- `id`
- `employee_id`
- `employee_name`
- `clock_in`
- `clock_out`
- `created_at`

A partial unique database index prevents an employee from having more than one open shift at a time.

## Database Functions

The React frontend interacts with Supabase through approved PostgreSQL functions rather than directly modifying the tables.

Current functions include:

- `list_active_employees`
- `verify_employee_pin`
- `clock_in_employee`
- `clock_out_employee`
- `get_employee_entries`

These functions validate the employee PIN before returning private shift data or modifying time entries.

## Security Notes

This project is intended for a small workplace time-clock system.

Current protections include:

- Hashed employee PINs
- Row Level Security
- Restricted table permissions
- Server-side PIN verification
- Controlled database functions
- Duplicate-shift prevention

A four-digit PIN should not be treated as strong authentication. Before broad public deployment, the project should also include rate limiting, request throttling, or stronger authentication.

Never expose a Supabase service-role key in this project. Only the publishable browser key belongs in the frontend environment configuration.

## Available Scripts

Start the development server:

npm run dev

Create a production build:

npm run build

Preview the production build locally:

npm run preview

Run the linter:

npm run lint

## Planned Features

- Manager and administrator dashboard
- Add, deactivate, and edit employees
- Edit incorrect time entries
- Weekly hour totals
- Payroll-period summaries
- CSV payroll export
- Employee notes
- Break tracking
- Manager approval workflow
- Improved request throttling
- Deployment to a production host

## Project Status

The core employee workflow is functional:

1. Select an employee
2. Enter a PIN
3. Clock in or clock out
4. Review recent shifts
5. Store all records in Supabase

The project is currently under active development.

## Author

Built by [Rob Regan](https://github.com/robregan).

## License

This project is currently unlicensed and intended for private or internal use.
