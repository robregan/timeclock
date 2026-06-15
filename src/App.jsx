import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [employees, setEmployees] = useState([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [loggedInEmployee, setLoggedInEmployee] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    loadEmployees()
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  async function loadEmployees() {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('list_active_employees')

    if (error) {
      console.error(error)
      setErrorMessage('Could not load employees.')
    } else {
      setEmployees(data ?? [])

      if (data?.length) {
        setSelectedEmployeeId(data[0].id)
      }
    }

    setLoading(false)
  }

  async function logIn(event) {
    event.preventDefault()

    if (!selectedEmployeeId || pin.length !== 4) {
      setErrorMessage('Select an employee and enter a 4-digit PIN.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('verify_employee_pin', {
      p_employee_id: selectedEmployeeId,
      p_pin: pin,
    })

    if (error || data !== true) {
      console.error(error)
      setErrorMessage('Incorrect PIN.')
      setSubmitting(false)
      return
    }

    const employee = employees.find((item) => item.id === selectedEmployeeId)

    setLoggedInEmployee(employee)
    await loadEntries(selectedEmployeeId, pin)
    setSubmitting(false)
  }

  async function loadEntries(
    employeeId = loggedInEmployee?.id,
    employeePin = pin,
  ) {
    if (!employeeId || !employeePin) {
      return
    }

    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('get_employee_entries', {
      p_employee_id: employeeId,
      p_pin: employeePin,
    })

    if (error) {
      console.error(error)
      setErrorMessage('Could not load time entries.')
    } else {
      setEntries(data ?? [])
    }

    setLoading(false)
  }

  const activeEntry = entries.find((entry) => entry.clock_out === null)

  async function clockIn() {
    if (!loggedInEmployee || activeEntry || submitting) {
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const { error } = await supabase.rpc('clock_in_employee', {
      p_employee_id: loggedInEmployee.id,
      p_pin: pin,
    })

    if (error) {
      console.error(error)
      setErrorMessage(
        error.message.includes('already clocked in')
          ? 'You are already clocked in.'
          : 'Clock-in failed.',
      )
    } else {
      await loadEntries()
    }

    setSubmitting(false)
  }

  async function clockOut() {
    if (!loggedInEmployee || !activeEntry || submitting) {
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const { error } = await supabase.rpc('clock_out_employee', {
      p_employee_id: loggedInEmployee.id,
      p_pin: pin,
    })

    if (error) {
      console.error(error)
      setErrorMessage('Clock-out failed.')
    } else {
      await loadEntries()
    }

    setSubmitting(false)
  }

  function logOut() {
    setLoggedInEmployee(null)
    setPin('')
    setEntries([])
    setErrorMessage('')
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  function calculateDuration(clockIn, clockOut) {
    if (!clockOut) {
      return 'In progress'
    }

    const milliseconds =
      new Date(clockOut).getTime() - new Date(clockIn).getTime()

    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000))

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return `${hours}h ${minutes}m`
  }

  if (!loggedInEmployee) {
    return (
      <main className='min-h-screen bg-[#f4f0e7] px-4 py-10 text-stone-800 sm:px-6'>
        <div className='mx-auto max-w-md'>
          <header className='mb-8 text-center'>
            <div className='mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#5f6f52] text-xl font-bold text-white shadow-sm'>
              H
            </div>

            <p className='mb-2 text-xs font-semibold tracking-[0.25em] text-[#6f735f] uppercase'>
              Hapgood Staff
            </p>

            <h1 className='text-3xl font-semibold tracking-tight text-stone-900'>
              Employee Time Clock
            </h1>

            <p className='mt-3 text-sm leading-6 text-stone-600'>
              Select your name and enter your PIN to continue.
            </p>
          </header>

          <form
            className='rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_20px_60px_rgba(67,62,51,0.12)] sm:p-8'
            onSubmit={logIn}
          >
            <div className='space-y-5'>
              <div>
                <label
                  className='mb-2 block text-sm font-semibold text-stone-700'
                  htmlFor='employee'
                >
                  Employee
                </label>

                <select
                  id='employee'
                  value={selectedEmployeeId}
                  onChange={(event) =>
                    setSelectedEmployeeId(event.target.value)
                  }
                  disabled={loading || submitting}
                  className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className='mb-2 block text-sm font-semibold text-stone-700'
                  htmlFor='pin'
                >
                  4-digit PIN
                </label>

                <input
                  id='pin'
                  type='password'
                  inputMode='numeric'
                  pattern='[0-9]{4}'
                  maxLength='4'
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  autoComplete='off'
                  disabled={submitting}
                  placeholder='••••'
                  className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-center text-2xl tracking-[0.6em] text-stone-900 outline-none transition placeholder:tracking-[0.3em] focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15 disabled:cursor-not-allowed disabled:opacity-60'
                />
              </div>

              <button
                type='submit'
                disabled={loading || submitting || pin.length !== 4}
                className='w-full rounded-xl bg-[#2f352b] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#252a22] focus:outline-none focus:ring-4 focus:ring-[#2f352b]/20 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {submitting ? 'Checking...' : 'Continue'}
              </button>
            </div>

            {errorMessage && (
              <p className='mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
                {errorMessage}
              </p>
            )}
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen bg-[#f4f0e7] px-4 py-6 text-stone-800 sm:px-6 sm:py-10'>
      <div className='mx-auto max-w-2xl'>
        <header className='mb-6 flex items-start justify-between gap-4'>
          <div>
            <p className='mb-1 text-xs font-semibold tracking-[0.22em] text-[#6f735f] uppercase'>
              Hapgood Staff
            </p>

            <h1 className='text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl'>
              Welcome, {loggedInEmployee.name}
            </h1>
          </div>

          <button
            type='button'
            onClick={logOut}
            disabled={submitting}
            className='rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'
          >
            Sign Out
          </button>
        </header>

        <section className='mb-6 overflow-hidden rounded-3xl bg-[#2f352b] p-6 text-white shadow-[0_24px_70px_rgba(48,53,43,0.22)] sm:p-8'>
          <div className='text-center'>
            <p className='text-sm font-medium text-white/65'>
              {currentTime.toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>

            <p className='mt-2 text-5xl font-semibold tracking-tight sm:text-6xl'>
              {currentTime.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>

            <div className='mx-auto mt-6 max-w-md rounded-2xl bg-white/8 px-5 py-4 ring-1 ring-white/10'>
              <div className='flex items-center justify-center gap-2'>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activeEntry ? 'bg-emerald-400' : 'bg-stone-400'
                  }`}
                />

                <p className='text-sm font-semibold'>
                  {activeEntry
                    ? `Clocked in at ${formatTime(activeEntry.clock_in)}`
                    : 'You are currently clocked out'}
                </p>
              </div>
            </div>

            <button
              type='button'
              onClick={activeEntry ? clockOut : clockIn}
              disabled={submitting}
              className={`mt-6 w-full max-w-md rounded-2xl px-6 py-4 text-lg font-bold shadow-lg transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
                activeEntry
                  ? 'bg-[#d8c6a2] text-[#2f352b] hover:bg-[#e2d1ae] focus:ring-[#d8c6a2]/30'
                  : 'bg-white text-[#2f352b] hover:bg-stone-100 focus:ring-white/30'
              }`}
            >
              {submitting
                ? 'Saving...'
                : activeEntry
                  ? 'Clock Out'
                  : 'Clock In'}
            </button>
          </div>
        </section>

        {errorMessage && (
          <p className='mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
            {errorMessage}
          </p>
        )}

        <section className='rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
          <div className='mb-5 flex items-center justify-between gap-4'>
            <div>
              <h2 className='text-xl font-semibold text-stone-900'>
                Recent Shifts
              </h2>

              <p className='mt-1 text-sm text-stone-500'>
                Your 20 most recent time entries
              </p>
            </div>

            <button
              type='button'
              onClick={() => loadEntries()}
              disabled={loading || submitting}
              className='rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50'
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className='py-10 text-center text-sm text-stone-500'>
              Loading entries...
            </div>
          ) : entries.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center'>
              <p className='font-medium text-stone-700'>No shifts yet</p>

              <p className='mt-1 text-sm text-stone-500'>
                Your completed shifts will appear here.
              </p>
            </div>
          ) : (
            <div className='divide-y divide-stone-200'>
              {entries.map((entry) => (
                <article
                  className='flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between'
                  key={entry.id}
                >
                  <div>
                    <p className='font-semibold text-stone-900'>
                      {formatDate(entry.clock_in)}
                    </p>

                    <p className='mt-1 text-sm text-stone-500'>
                      {formatTime(entry.clock_in)}
                      {' – '}
                      {entry.clock_out ? formatTime(entry.clock_out) : 'Now'}
                    </p>
                  </div>

                  <div className='flex items-center justify-between gap-3 sm:justify-end'>
                    {!entry.clock_out && (
                      <span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'>
                        Active
                      </span>
                    )}

                    <span className='rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700'>
                      {calculateDuration(entry.clock_in, entry.clock_out)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className='py-6 text-center text-xs text-stone-500'>
          Hapgood Employee Time Clock
        </footer>
      </div>
    </main>
  )
}

export default App
