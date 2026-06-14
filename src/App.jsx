import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [employees, setEmployees] = useState([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [loggedInEmployee, setLoggedInEmployee] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadEmployees()
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

  if (!loggedInEmployee) {
    return (
      <main className='app'>
        <h1>Employee Time Clock</h1>

        <form className='card' onSubmit={logIn}>
          <label htmlFor='employee'>Employee</label>

          <select
            id='employee'
            value={selectedEmployeeId}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            disabled={loading || submitting}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>

          <label htmlFor='pin'>4-digit PIN</label>

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
          />

          <button
            type='submit'
            disabled={loading || submitting || pin.length !== 4}
          >
            {submitting ? 'Checking...' : 'Continue'}
          </button>

          {errorMessage && <p className='error-message'>{errorMessage}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className='app'>
      <div className='page-heading'>
        <div>
          <h1>Employee Time Clock</h1>
          <p>
            Signed in as <strong>{loggedInEmployee.name}</strong>
          </p>
        </div>

        <button
          className='secondary-button'
          onClick={logOut}
          disabled={submitting}
        >
          Sign Out
        </button>
      </div>

      <section className='card'>
        {activeEntry ? (
          <>
            <p className='status-message'>
              Clocked in at{' '}
              <strong>
                {new Date(activeEntry.clock_in).toLocaleTimeString()}
              </strong>
            </p>

            <button onClick={clockOut} disabled={submitting}>
              {submitting ? 'Saving...' : 'Clock Out'}
            </button>
          </>
        ) : (
          <>
            <p className='status-message'>You are currently clocked out.</p>

            <button onClick={clockIn} disabled={submitting}>
              {submitting ? 'Saving...' : 'Clock In'}
            </button>
          </>
        )}

        {errorMessage && <p className='error-message'>{errorMessage}</p>}
      </section>

      <section className='card'>
        <div className='section-heading'>
          <h2>Recent Shifts</h2>

          <button
            className='secondary-button'
            onClick={() => loadEntries()}
            disabled={loading || submitting}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading entries...</p>
        ) : entries.length === 0 ? (
          <p>No shifts yet.</p>
        ) : (
          entries.map((entry) => (
            <div className='entry' key={entry.id}>
              <p>
                <strong>In:</strong> {new Date(entry.clock_in).toLocaleString()}
              </p>

              <p>
                <strong>Out:</strong>{' '}
                {entry.clock_out
                  ? new Date(entry.clock_out).toLocaleString()
                  : 'Currently clocked in'}
              </p>
            </div>
          ))
        )}
      </section>
    </main>
  )
}

export default App
