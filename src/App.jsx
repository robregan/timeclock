import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function getStartOfWeek(date) {
  const result = new Date(date)
  const day = result.getDay()
  const difference = day === 0 ? -6 : 1 - day

  result.setDate(result.getDate() + difference)
  result.setHours(0, 0, 0, 0)

  return result
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDateForInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDateTimeForInput(value) {
  const date = new Date(value)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const translations = {
  en: {
    staffLabel: 'Hapgood Staff',
    employeeTimeClock: 'Employee Time Clock',
    loginInstructions: 'Select your name and enter your PIN to continue.',
    employee: 'Employee',
    pin: '4-digit PIN',
    checking: 'Checking...',
    continue: 'Continue',
    hello: 'Welcome',
    signOut: 'Sign Out',
    clockIn: 'Clock In',
    clockOut: 'Clock Out',
    saving: 'Saving...',
    clockedOut: 'You are currently clocked out',
    clockedInAt: 'Clocked in at',
    recentShifts: 'Recent Shifts',
    recentShiftsDescription: 'Your 20 most recent time entries',
    refresh: 'Refresh',
    loadingEntries: 'Loading entries...',
    noShifts: 'No shifts yet',
    noShiftsDescription: 'Your completed shifts will appear here.',
    active: 'Active',
    inProgress: 'In progress',
    requestCorrection: 'Request Correction',
    reportMissedShift: 'Report Missed Shift',
    missedShift: 'Missed Shift',
    missedShiftDescription:
      'Forgot to clock in for a whole shift? Submit a request for manager approval.',
    correctionPending: 'Correction pending',
    correctionApproved: 'Correction approved',
    correctionRejected: 'Correction rejected',
    employeeFooter: 'Hapgood Employee Time Clock',
    shiftCorrection: 'Shift Correction',
    requestChange: 'Request a change',
    managerApprovalNotice: 'This request must be approved by a manager.',
    close: 'Close',
    correctClockIn: 'Correct clock-in',
    correctClockOut: 'Correct clock-out',
    reason: 'Reason',
    reasonPlaceholder: 'Example: I forgot to clock out before leaving.',
    submitting: 'Submitting...',
    submitCorrection: 'Submit Correction Request',
    submitMissedShift: 'Submit Missed Shift Request',
    errors: {
      loginFields: 'Select an employee and enter a 4-digit PIN.',
      incorrectPin: 'Incorrect PIN.',
      employeeNotFound: 'Could not find that employee.',
      loadEmployees: 'Could not load employees.',
      loadEntries: 'Could not load time entries.',
      loadCorrections: 'Could not load correction requests.',
      alreadyClockedIn: 'You are already clocked in.',
      clockInFailed: 'Clock-in failed.',
      clockOutFailed: 'Clock-out failed.',
      correctionFields: 'Enter the corrected times and a short explanation.',
      missedShiftFields:
        'Enter the missed shift times and a short explanation.',
      invalidTimeOrder: 'Clock-out must be after clock-in.',
      correctionPending:
        'A correction request is already pending for this shift.',
      correctionSubmitFailed: 'Could not submit correction request.',
      missedShiftSubmitFailed: 'Could not submit missed shift request.',
    },
  },
  es: {
    staffLabel: 'Personal de Hapgood',
    employeeTimeClock: 'Reloj de empleados',
    loginInstructions: 'Selecciona tu nombre e ingresa tu PIN para continuar.',
    employee: 'Empleado',
    pin: 'PIN de 4 dígitos',
    checking: 'Verificando...',
    continue: 'Continuar',
    hello: 'Hola',
    signOut: 'Cerrar sesión',
    clockIn: 'Marcar entrada',
    clockOut: 'Marcar salida',
    saving: 'Guardando...',
    clockedOut: 'Actualmente no has marcado entrada',
    clockedInAt: 'Entrada registrada a las',
    recentShifts: 'Turnos recientes',
    recentShiftsDescription: 'Tus 20 registros de tiempo más recientes',
    refresh: 'Actualizar',
    loadingEntries: 'Cargando registros...',
    noShifts: 'Aún no hay turnos',
    noShiftsDescription: 'Tus turnos completados aparecerán aquí.',
    active: 'Activo',
    inProgress: 'En curso',
    requestCorrection: 'Solicitar corrección',
    reportMissedShift: 'Reportar turno olvidado',
    missedShift: 'Turno olvidado',
    missedShiftDescription:
      '¿Olvidaste marcar entrada durante un turno completo? Envía una solicitud para aprobación del gerente.',
    correctionPending: 'Corrección pendiente',
    correctionApproved: 'Corrección aprobada',
    correctionRejected: 'Corrección rechazada',
    employeeFooter: 'Reloj de empleados de Hapgood',
    shiftCorrection: 'Corrección de turno',
    requestChange: 'Solicitar un cambio',
    managerApprovalNotice: 'Esta solicitud debe ser aprobada por un gerente.',
    close: 'Cerrar',
    correctClockIn: 'Hora correcta de entrada',
    correctClockOut: 'Hora correcta de salida',
    reason: 'Motivo',
    reasonPlaceholder: 'Ejemplo: Olvidé marcar la salida antes de irme.',
    submitting: 'Enviando...',
    submitCorrection: 'Enviar solicitud de corrección',
    submitMissedShift: 'Enviar solicitud de turno olvidado',
    errors: {
      loginFields: 'Selecciona un empleado e ingresa un PIN de 4 dígitos.',
      incorrectPin: 'PIN incorrecto.',
      employeeNotFound: 'No se pudo encontrar a ese empleado.',
      loadEmployees: 'No se pudo cargar la lista de empleados.',
      loadEntries: 'No se pudieron cargar los registros de tiempo.',
      loadCorrections: 'No se pudieron cargar las solicitudes de corrección.',
      alreadyClockedIn: 'Ya has marcado tu entrada.',
      clockInFailed: 'No se pudo marcar la entrada.',
      clockOutFailed: 'No se pudo marcar la salida.',
      correctionFields: 'Ingresa las horas corregidas y una breve explicación.',
      missedShiftFields:
        'Ingresa las horas del turno olvidado y una breve explicación.',
      invalidTimeOrder:
        'La hora de salida debe ser posterior a la hora de entrada.',
      correctionPending:
        'Ya hay una solicitud de corrección pendiente para este turno.',
      correctionSubmitFailed: 'No se pudo enviar la solicitud de corrección.',
      missedShiftSubmitFailed:
        'No se pudo enviar la solicitud de turno olvidado.',
    },
  },
}

function LanguageToggle({ language, onChange }) {
  return (
    <div className='inline-flex rounded-xl border border-stone-300 bg-white p-1 shadow-sm'>
      <button
        type='button'
        onClick={() => onChange('es')}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
          language === 'es'
            ? 'bg-[#2f352b] text-white'
            : 'text-stone-600 hover:bg-stone-100'
        }`}
      >
        Español
      </button>

      <button
        type='button'
        onClick={() => onChange('en')}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
          language === 'en'
            ? 'bg-[#2f352b] text-white'
            : 'text-stone-600 hover:bg-stone-100'
        }`}
      >
        English
      </button>
    </div>
  )
}

function App() {
  const isManagerRoute = window.location.pathname === '/manager'

  const [employees, setEmployees] = useState([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [loggedInEmployee, setLoggedInEmployee] = useState(null)
  const [language, setLanguage] = useState(
    () => localStorage.getItem('employeeLanguage') || 'es',
  )
  const t = translations[language]

  const [entries, setEntries] = useState([])
  const [managerTotals, setManagerTotals] = useState([])
  const [managerShifts, setManagerShifts] = useState([])
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null)
  const [correctionRequests, setCorrectionRequests] = useState([])
  const [pendingCorrections, setPendingCorrections] = useState([])

  const [selectedShift, setSelectedShift] = useState(null)
  const [requestMode, setRequestMode] = useState('correction')
  const [requestedClockIn, setRequestedClockIn] = useState('')
  const [requestedClockOut, setRequestedClockOut] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  const [activeManagerNoteId, setActiveManagerNoteId] = useState(null)
  const [reviewingRequestId, setReviewingRequestId] = useState(null)
  const [managerNote, setManagerNote] = useState('')

  const currentWeekStart = getStartOfWeek(new Date())

  const [startDate, setStartDate] = useState(() =>
    formatDateForInput(currentWeekStart),
  )

  const [endDate, setEndDate] = useState(() =>
    formatDateForInput(addDays(currentWeekStart, 6)),
  )

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

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage)
    localStorage.setItem('employeeLanguage', nextLanguage)
  }

  async function loadEmployees() {
    setLoading(true)
    setErrorMessage('')

    const employeeListFunction = isManagerRoute
      ? 'list_active_managers'
      : 'list_clockable_employees'

    const { data, error } = await supabase.rpc(employeeListFunction)

    if (error) {
      console.error(error)
      setErrorMessage(translations[loginLanguage].errors.loadEmployees)
    } else {
      setEmployees(data ?? [])

      if (data?.length) {
        setSelectedEmployeeId(data[0].id)
      } else {
        setSelectedEmployeeId('')
      }
    }

    setLoading(false)
  }

  async function logIn(event) {
    event.preventDefault()

    if (!selectedEmployeeId || pin.length !== 4) {
      setErrorMessage(loginT.errors.loginFields)
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
      setErrorMessage(loginT.errors.incorrectPin)
      setSubmitting(false)
      return
    }

    const employee = employees.find((item) => item.id === selectedEmployeeId)

    if (!employee) {
      setErrorMessage(loginT.errors.employeeNotFound)
      setSubmitting(false)
      return
    }

    if (isManagerRoute && employee.role !== 'manager') {
      setErrorMessage('Manager access required.')
      setSubmitting(false)
      return
    }

    if (!isManagerRoute && employee.can_clock === false) {
      setErrorMessage(loginT.errors.employeeNotFound)
      setSubmitting(false)
      return
    }

    setLoggedInEmployee(employee)

    if (isManagerRoute) {
      await Promise.all([
        loadManagerTotals(employee.id, pin),
        loadPendingCorrections(employee.id, pin),
      ])
    } else {
      await Promise.all([
        loadEntries(employee.id, pin),
        loadEmployeeCorrectionRequests(employee.id, pin),
      ])
    }

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
      setErrorMessage(t.errors.loadEntries)
    } else {
      setEntries(data ?? [])
    }

    setLoading(false)
  }

  async function loadManagerTotals(
    managerId = loggedInEmployee?.id,
    managerPin = pin,
  ) {
    if (!managerId || !managerPin || !startDate || !endDate) {
      return
    }

    if (new Date(startDate) > new Date(endDate)) {
      setErrorMessage('The start date must be before the end date.')
      return
    }

    setLoading(true)
    setErrorMessage('')

    const rangeStart = new Date(`${startDate}T00:00:00`)
    const rangeEnd = new Date(`${endDate}T00:00:00`)
    rangeEnd.setDate(rangeEnd.getDate() + 1)

    const payload = {
      p_manager_id: managerId,
      p_pin: managerPin,
      p_start_date: rangeStart.toISOString(),
      p_end_date: rangeEnd.toISOString(),
    }

    const [totalsResponse, shiftsResponse] = await Promise.all([
      supabase.rpc('get_manager_hour_totals', payload),
      supabase.rpc('get_manager_shift_details', payload),
    ])

    if (totalsResponse.error || shiftsResponse.error) {
      console.error(totalsResponse.error || shiftsResponse.error)
      setErrorMessage('Could not load employee totals.')
      setManagerTotals([])
      setManagerShifts([])
    } else {
      setManagerTotals(totalsResponse.data ?? [])
      setManagerShifts(shiftsResponse.data ?? [])
    }

    setLoading(false)
  }

  async function loadPendingCorrections(
    managerId = loggedInEmployee?.id,
    managerPin = pin,
  ) {
    if (!managerId || !managerPin) {
      return
    }

    const { data, error } = await supabase.rpc(
      'get_pending_correction_requests',
      {
        p_manager_id: managerId,
        p_pin: managerPin,
      },
    )

    if (error) {
      console.error(error)
      setErrorMessage(t.errors.loadCorrections)
      setPendingCorrections([])
    } else {
      setPendingCorrections(data ?? [])
    }
  }

  async function loadEmployeeCorrectionRequests(
    employeeId = loggedInEmployee?.id,
    employeePin = pin,
  ) {
    if (!employeeId || !employeePin) {
      return
    }

    const { data, error } = await supabase.rpc(
      'get_employee_correction_requests',
      {
        p_employee_id: employeeId,
        p_pin: employeePin,
      },
    )

    if (error) {
      console.error(error)
      setErrorMessage(t.errors.loadCorrections)
    } else {
      setCorrectionRequests(data ?? [])
    }
  }

  const activeEntry = entries.find((entry) => entry.clock_out === null)
  const isRequestModalOpen = requestMode === 'missing' || selectedShift !== null

  async function clockIn() {
    if (!loggedInEmployee || activeEntry || submitting || isManagerRoute) {
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
          ? t.errors.alreadyClockedIn
          : t.errors.clockInFailed,
      )
    } else {
      await loadEntries()
    }

    setSubmitting(false)
  }

  async function clockOut() {
    if (!loggedInEmployee || !activeEntry || submitting || isManagerRoute) {
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
      setErrorMessage(t.errors.clockOutFailed)
    } else {
      await loadEntries()
    }

    setSubmitting(false)
  }

  function openCorrectionForm(entry) {
    setRequestMode('correction')
    setSelectedShift(entry)
    setRequestedClockIn(formatDateTimeForInput(entry.clock_in))
    setRequestedClockOut(formatDateTimeForInput(entry.clock_out))
    setCorrectionReason('')
    setErrorMessage('')
  }

  function openMissedShiftForm() {
    const now = new Date()
    now.setSeconds(0, 0)

    const defaultClockOut = new Date(now)
    defaultClockOut.setHours(defaultClockOut.getHours() + 1)

    setRequestMode('missing')
    setSelectedShift(null)
    setRequestedClockIn(formatDateTimeForInput(now))
    setRequestedClockOut(formatDateTimeForInput(defaultClockOut))
    setCorrectionReason('')
    setErrorMessage('')
  }

  function closeCorrectionForm() {
    if (submitting) {
      return
    }

    setSelectedShift(null)
    setRequestMode('correction')
    setRequestedClockIn('')
    setRequestedClockOut('')
    setCorrectionReason('')
    setErrorMessage('')
  }

  async function submitCorrectionRequest(event) {
    event.preventDefault()

    if (
      (requestMode === 'correction' && !selectedShift) ||
      !requestedClockIn ||
      !requestedClockOut ||
      correctionReason.trim().length < 3
    ) {
      setErrorMessage(
        requestMode === 'missing'
          ? t.errors.missedShiftFields
          : t.errors.correctionFields,
      )
      return
    }

    const clockInDate = new Date(requestedClockIn)
    const clockOutDate = new Date(requestedClockOut)

    if (clockOutDate <= clockInDate) {
      setErrorMessage(t.errors.invalidTimeOrder)
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const rpcName =
      requestMode === 'missing'
        ? 'submit_missed_shift_request'
        : 'submit_shift_correction'

    const rpcPayload =
      requestMode === 'missing'
        ? {
            p_employee_id: loggedInEmployee.id,
            p_pin: pin,
            p_requested_clock_in: clockInDate.toISOString(),
            p_requested_clock_out: clockOutDate.toISOString(),
            p_reason: correctionReason.trim(),
          }
        : {
            p_employee_id: loggedInEmployee.id,
            p_pin: pin,
            p_time_entry_id: selectedShift.id,
            p_requested_clock_in: clockInDate.toISOString(),
            p_requested_clock_out: clockOutDate.toISOString(),
            p_reason: correctionReason.trim(),
          }

    const { error } = await supabase.rpc(rpcName, rpcPayload)

    if (error) {
      console.error(error)

      if (error.message.includes('already pending')) {
        setErrorMessage(t.errors.correctionPending)
      } else {
        setErrorMessage(
          requestMode === 'missing'
            ? t.errors.missedShiftSubmitFailed
            : t.errors.correctionSubmitFailed,
        )
      }
    } else {
      await loadEmployeeCorrectionRequests()
      closeCorrectionForm()
    }

    setSubmitting(false)
  }

  async function reviewCorrection(requestId, decision) {
    if (!loggedInEmployee || reviewingRequestId || !isManagerRoute) {
      return
    }

    setReviewingRequestId(requestId)
    setErrorMessage('')

    const { error } = await supabase.rpc('review_shift_correction', {
      p_manager_id: loggedInEmployee.id,
      p_pin: pin,
      p_request_id: requestId,
      p_decision: decision,
      p_manager_note:
        activeManagerNoteId === requestId ? managerNote.trim() || null : null,
    })

    if (error) {
      console.error(error)
      setErrorMessage('Could not review correction request.')
    } else {
      setManagerNote('')
      setActiveManagerNoteId(null)

      await Promise.all([loadPendingCorrections(), loadManagerTotals()])
    }

    setReviewingRequestId(null)
  }

  function getCorrectionForShift(timeEntryId) {
    return correctionRequests.find(
      (request) => request.time_entry_id === timeEntryId,
    )
  }

  function logOut() {
    const beginning = getStartOfWeek(new Date())

    setCorrectionRequests([])
    setPendingCorrections([])
    setSelectedShift(null)
    setRequestMode('correction')
    setRequestedClockIn('')
    setRequestedClockOut('')
    setCorrectionReason('')
    setManagerNote('')
    setActiveManagerNoteId(null)
    setReviewingRequestId(null)
    setLoggedInEmployee(null)
    setPin('')
    setEntries([])
    setManagerTotals([])
    setManagerShifts([])
    setExpandedEmployeeId(null)
    setErrorMessage('')
    setStartDate(formatDateForInput(beginning))
    setEndDate(formatDateForInput(addDays(beginning, 6)))
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
      return t.inProgress
    }

    const milliseconds =
      new Date(clockOut).getTime() - new Date(clockIn).getTime()

    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return `${hours}h ${minutes}m`
  }

  function formatSeconds(totalSeconds) {
    const seconds = Number(totalSeconds ?? 0)
    const totalMinutes = Math.floor(seconds / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return `${hours}h ${minutes}m`
  }

  function selectCurrentWeek() {
    const beginning = getStartOfWeek(new Date())

    setStartDate(formatDateForInput(beginning))
    setEndDate(formatDateForInput(addDays(beginning, 6)))
  }

  const totalTeamSeconds = managerTotals.reduce(
    (total, employee) => total + Number(employee.total_seconds ?? 0),
    0,
  )

  const currentlyClockedInCount = managerTotals.filter(
    (employee) => employee.currently_clocked_in,
  ).length

  function getManagerShiftsForEmployee(employeeId) {
    return managerShifts.filter((shift) => shift.employee_id === employeeId)
  }

  const loginLanguage = isManagerRoute ? 'en' : language
  const loginT = translations[loginLanguage]

  if (!loggedInEmployee) {
    return (
      <main className='min-h-screen bg-[#f4f0e7] px-4 py-10 text-stone-800 sm:px-6'>
        <div className='mx-auto max-w-md'>
          {!isManagerRoute && (
            <div className='mb-6 flex justify-end'>
              <LanguageToggle language={language} onChange={changeLanguage} />
            </div>
          )}

          <header className='mb-8 text-center'>
            <div className='mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#5f6f52] text-xl font-bold text-white shadow-sm'>
              H
            </div>

            <p className='mb-2 text-xs font-semibold tracking-[0.25em] text-[#6f735f] uppercase'>
              {isManagerRoute ? 'Hapgood Management' : loginT.staffLabel}
            </p>

            <h1 className='text-3xl font-semibold tracking-tight text-stone-900'>
              {isManagerRoute ? 'Manager Login' : loginT.employeeTimeClock}
            </h1>

            <p className='mt-3 text-sm leading-6 text-stone-600'>
              {isManagerRoute
                ? 'Enter your manager PIN to continue.'
                : loginT.loginInstructions}
            </p>
          </header>

          <form
            className='rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_20px_60px_rgba(67,62,51,0.12)] sm:p-8'
            onSubmit={logIn}
          >
            <div className='space-y-5'>
              {isManagerRoute ? (
                <div className='rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4'>
                  <p className='text-sm font-semibold text-stone-700'>
                    Manager access
                  </p>
                  <p className='mt-1 text-sm text-stone-500'>
                    Enter the manager PIN below.
                  </p>
                </div>
              ) : (
                <div>
                  <label
                    className='mb-2 block text-sm font-semibold text-stone-700'
                    htmlFor='employee'
                  >
                    {loginT.employee}
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
                    {employees.length === 0 && (
                      <option value=''>
                        {loading ? 'Loading...' : 'No employees found'}
                      </option>
                    )}

                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  className='mb-2 block text-sm font-semibold text-stone-700'
                  htmlFor='pin'
                >
                  {loginT.pin}
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
                {submitting ? loginT.checking : loginT.continue}
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

  if (isManagerRoute && loggedInEmployee.role === 'manager') {
    return (
      <main className='min-h-screen bg-[#f4f0e7] px-4 py-6 text-stone-800 sm:px-6 sm:py-10'>
        <div className='mx-auto max-w-4xl'>
          <header className='mb-6 flex items-start justify-between gap-4'>
            <div>
              <p className='mb-1 text-xs font-semibold tracking-[0.22em] text-[#6f735f] uppercase'>
                Hapgood Management
              </p>

              <h1 className='text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl'>
                Hours Summary
              </h1>

              <p className='mt-2 text-sm text-stone-600'>Manager dashboard</p>
            </div>

            <button
              type='button'
              onClick={logOut}
              className='rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50'
            >
              Sign Out
            </button>
          </header>

          <section className='mb-6 rounded-3xl bg-[#2f352b] p-6 text-white shadow-[0_24px_70px_rgba(48,53,43,0.22)] sm:p-8'>
            <p className='text-sm font-medium text-white/65'>Date range</p>

            <h2 className='mt-1 text-2xl font-semibold'>Custom Hours Report</h2>

            <div className='mt-6 grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-2'>
              <div className='w-full min-w-0 max-w-full'>
                <label
                  htmlFor='start-date'
                  className='mb-2 block text-sm font-semibold text-white/80'
                >
                  Start date
                </label>

                <input
                  id='start-date'
                  type='date'
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className='ios-date-input rounded-xl border border-white/15 bg-white px-4 py-3 text-stone-900 outline-none focus:ring-4 focus:ring-white/20'
                />
              </div>

              <div className='w-full min-w-0 max-w-full'>
                <label
                  htmlFor='end-date'
                  className='mb-2 block text-sm font-semibold text-white/80'
                >
                  End date (inclusive)
                </label>

                <input
                  id='end-date'
                  type='date'
                  value={endDate}
                  min={startDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className='ios-date-input rounded-xl border border-white/15 bg-white px-4 py-3 text-stone-900 outline-none focus:ring-4 focus:ring-white/20'
                />
              </div>
            </div>

            <div className='mt-5 flex flex-col gap-3 sm:flex-row'>
              <button
                type='button'
                onClick={() => loadManagerTotals()}
                disabled={loading || !startDate || !endDate}
                className='rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#2f352b] transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? 'Loading...' : 'Apply Date Range'}
              </button>

              <button
                type='button'
                onClick={selectCurrentWeek}
                disabled={loading}
                className='rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50'
              >
                Select Current Week
              </button>
            </div>
          </section>

          {errorMessage && (
            <p className='mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
              {errorMessage}
            </p>
          )}

          <section className='mb-6 grid gap-4 sm:grid-cols-2'>
            <article className='rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_16px_50px_rgba(67,62,51,0.08)]'>
              <p className='text-sm font-medium text-stone-500'>
                Total team hours
              </p>
              <p className='mt-2 text-3xl font-semibold text-stone-900'>
                {formatSeconds(totalTeamSeconds)}
              </p>
            </article>

            <article className='rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_16px_50px_rgba(67,62,51,0.08)]'>
              <p className='text-sm font-medium text-stone-500'>
                Currently clocked in
              </p>
              <p className='mt-2 text-3xl font-semibold text-stone-900'>
                {currentlyClockedInCount}
              </p>
            </article>
          </section>

          <section className='mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
            <div className='mb-5 flex items-center justify-between gap-4'>
              <div>
                <h2 className='text-xl font-semibold text-stone-900'>
                  Pending Requests
                </h2>
                <p className='mt-1 text-sm text-stone-500'>
                  Review corrections and missed shifts before changing payroll
                  records.
                </p>
              </div>

              <span className='rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700'>
                {pendingCorrections.length} pending
              </span>
            </div>

            {pendingCorrections.length === 0 ? (
              <div className='rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center'>
                <p className='font-medium text-stone-700'>
                  No pending requests
                </p>
              </div>
            ) : (
              <div className='space-y-4'>
                {pendingCorrections.map((request) => (
                  <article
                    key={request.request_id}
                    className='rounded-2xl border border-stone-200 bg-stone-50 p-5'
                  >
                    <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                      <div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h3 className='text-lg font-semibold text-stone-900'>
                            {request.employee_name}
                          </h3>
                          <span className='rounded-full bg-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700'>
                            {request.request_type === 'missing_shift'
                              ? 'Missed Shift'
                              : 'Correction'}
                          </span>
                        </div>
                        <p className='mt-1 text-sm text-stone-500'>
                          Submitted{' '}
                          {new Date(request.created_at).toLocaleString()}
                        </p>
                      </div>

                      <span className='self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700'>
                        Pending
                      </span>
                    </div>

                    <div className='mt-5 grid gap-4 sm:grid-cols-2'>
                      {request.request_type === 'correction' && (
                        <div className='rounded-xl bg-white p-4'>
                          <p className='text-xs font-semibold tracking-wide text-stone-500 uppercase'>
                            Original
                          </p>
                          <p className='mt-2 text-sm font-medium text-stone-800'>
                            In:{' '}
                            {new Date(
                              request.original_clock_in,
                            ).toLocaleString()}
                          </p>
                          <p className='mt-1 text-sm font-medium text-stone-800'>
                            Out:{' '}
                            {new Date(
                              request.original_clock_out,
                            ).toLocaleString()}
                          </p>
                        </div>
                      )}

                      <div className='rounded-xl bg-white p-4 ring-1 ring-[#68785b]/20'>
                        <p className='text-xs font-semibold tracking-wide text-[#68785b] uppercase'>
                          {request.request_type === 'missing_shift'
                            ? 'Requested Shift'
                            : 'Requested'}
                        </p>
                        <p className='mt-2 text-sm font-medium text-stone-800'>
                          In:{' '}
                          {new Date(
                            request.requested_clock_in,
                          ).toLocaleString()}
                        </p>
                        <p className='mt-1 text-sm font-medium text-stone-800'>
                          Out:{' '}
                          {new Date(
                            request.requested_clock_out,
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className='mt-4 rounded-xl bg-white p-4'>
                      <p className='text-xs font-semibold tracking-wide text-stone-500 uppercase'>
                        Employee reason
                      </p>
                      <p className='mt-2 text-sm leading-6 text-stone-700'>
                        {request.reason}
                      </p>
                    </div>

                    <div className='mt-4'>
                      <label
                        htmlFor={`manager-note-${request.request_id}`}
                        className='mb-2 block text-sm font-semibold text-stone-700'
                      >
                        Manager note
                      </label>

                      <textarea
                        id={`manager-note-${request.request_id}`}
                        rows='2'
                        value={
                          activeManagerNoteId === request.request_id
                            ? managerNote
                            : ''
                        }
                        onFocus={() => {
                          setActiveManagerNoteId(request.request_id)
                          setManagerNote('')
                        }}
                        onChange={(event) => {
                          setActiveManagerNoteId(request.request_id)
                          setManagerNote(event.target.value)
                        }}
                        placeholder='Optional note'
                        className='w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15'
                      />
                    </div>

                    <div className='mt-4 flex flex-col gap-3 sm:flex-row'>
                      <button
                        type='button'
                        onClick={() =>
                          reviewCorrection(request.request_id, 'approved')
                        }
                        disabled={reviewingRequestId !== null}
                        className='flex-1 rounded-xl bg-[#2f352b] px-5 py-3 font-semibold text-white transition hover:bg-[#252a22] disabled:opacity-50'
                      >
                        {reviewingRequestId === request.request_id
                          ? 'Processing...'
                          : 'Approve'}
                      </button>

                      <button
                        type='button'
                        onClick={() =>
                          reviewCorrection(request.request_id, 'rejected')
                        }
                        disabled={reviewingRequestId !== null}
                        className='flex-1 rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50'
                      >
                        {reviewingRequestId === request.request_id
                          ? 'Processing...'
                          : 'Reject'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className='rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
            <div className='mb-5 flex items-center justify-between gap-4'>
              <div>
                <h2 className='text-xl font-semibold text-stone-900'>
                  Employee Totals
                </h2>
                <p className='mt-1 text-sm text-stone-500'>
                  Total hours and shifts from{' '}
                  {new Date(`${startDate}T00:00:00`).toLocaleDateString()}
                  {' through '}
                  {new Date(`${endDate}T00:00:00`).toLocaleDateString()}
                </p>
              </div>

              <button
                type='button'
                onClick={() => loadManagerTotals()}
                disabled={loading}
                className='rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50'
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <div className='py-12 text-center text-sm text-stone-500'>
                Loading employee totals...
              </div>
            ) : managerTotals.length === 0 ? (
              <div className='rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center'>
                <p className='font-medium text-stone-700'>No employees found</p>
              </div>
            ) : (
              <div className='space-y-3'>
                {managerTotals.map((employee) => {
                  const isExpanded = expandedEmployeeId === employee.employee_id
                  const employeeShifts = getManagerShiftsForEmployee(
                    employee.employee_id,
                  )

                  return (
                    <article
                      key={employee.employee_id}
                      className='overflow-hidden rounded-2xl border border-stone-200 bg-stone-50'
                    >
                      <button
                        type='button'
                        onClick={() =>
                          setExpandedEmployeeId(
                            isExpanded ? null : employee.employee_id,
                          )
                        }
                        className='flex w-full flex-col gap-4 p-4 text-left transition hover:bg-stone-100 sm:flex-row sm:items-center sm:justify-between'
                        aria-expanded={isExpanded}
                      >
                        <div>
                          <div className='flex items-center gap-2'>
                            <h3 className='font-semibold text-stone-900'>
                              {employee.employee_name}
                            </h3>

                            {employee.currently_clocked_in && (
                              <span className='rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'>
                                Clocked In
                              </span>
                            )}
                          </div>

                          <p className='mt-1 text-sm text-stone-500'>
                            {employee.shift_count}{' '}
                            {Number(employee.shift_count) === 1
                              ? 'shift'
                              : 'shifts'}
                            {' • '}
                            {isExpanded ? 'Hide details' : 'View shifts'}
                          </p>
                        </div>

                        <div className='flex items-center gap-3 sm:justify-end'>
                          <p className='text-2xl font-semibold text-stone-900'>
                            {formatSeconds(employee.total_seconds)}
                          </p>

                          <span className='text-lg text-stone-400'>
                            {isExpanded ? '−' : '+'}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className='border-t border-stone-200 bg-white px-4 py-4'>
                          {employeeShifts.length === 0 ? (
                            <p className='rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500'>
                              No shifts found for this date range.
                            </p>
                          ) : (
                            <div className='space-y-3'>
                              {employeeShifts.map((shift) => (
                                <div
                                  key={shift.entry_id}
                                  className='rounded-xl border border-stone-200 bg-stone-50 px-4 py-3'
                                >
                                  <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                                    <div>
                                      <p className='font-semibold text-stone-900'>
                                        {formatDate(shift.clock_in)}
                                      </p>
                                      <p className='mt-1 text-sm text-stone-500'>
                                        {formatTime(shift.clock_in)}
                                        {' – '}
                                        {shift.clock_out
                                          ? formatTime(shift.clock_out)
                                          : 'Now'}
                                      </p>
                                    </div>

                                    <div className='flex items-center gap-2 sm:justify-end'>
                                      {!shift.clock_out && (
                                        <span className='rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'>
                                          Active
                                        </span>
                                      )}

                                      {shift.edited_at && (
                                        <span className='rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700'>
                                          Edited
                                        </span>
                                      )}

                                      <span className='rounded-full bg-white px-3 py-1 text-sm font-semibold text-stone-700 ring-1 ring-stone-200'>
                                        {formatSeconds(shift.total_seconds)}
                                      </span>
                                    </div>
                                  </div>

                                  {shift.edit_reason && (
                                    <p className='mt-2 text-xs text-stone-500'>
                                      {shift.edit_reason}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <footer className='py-6 text-center text-xs text-stone-500'>
            Hapgood Management Dashboard
          </footer>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen bg-[#f4f0e7] px-4 py-6 text-stone-800 sm:px-6 sm:py-10'>
      <div className='mx-auto max-w-2xl'>
        <div className='mb-4 flex justify-end'>
          <LanguageToggle language={language} onChange={changeLanguage} />
        </div>

        <header className='mb-6 flex items-start justify-between gap-4'>
          <div>
            <p className='mb-1 text-xs font-semibold tracking-[0.22em] text-[#6f735f] uppercase'>
              {t.staffLabel}
            </p>

            <h1 className='text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl'>
              {t.hello}, {loggedInEmployee.name}
            </h1>
          </div>

          <button
            type='button'
            onClick={logOut}
            disabled={submitting}
            className='rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50'
          >
            {t.signOut}
          </button>
        </header>

        <section className='mb-6 w-full max-w-full overflow-hidden rounded-3xl bg-[#2f352b] p-6 text-white shadow-[0_24px_70px_rgba(48,53,43,0.22)] sm:p-8'>
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
                second: '2-digit',
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
                    ? `${t.clockedInAt} ${formatTime(activeEntry.clock_in)}`
                    : t.clockedOut}
                </p>
              </div>
            </div>

            <button
              type='button'
              onClick={activeEntry ? clockOut : clockIn}
              disabled={submitting}
              className={`mt-6 w-full max-w-md rounded-2xl px-6 py-4 text-lg font-bold shadow-lg transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
                activeEntry
                  ? 'bg-[#d8c6a2] text-[#2f352b] hover:bg-[#e2d1ae]'
                  : 'bg-white text-[#2f352b] hover:bg-stone-100'
              }`}
            >
              {submitting ? t.saving : activeEntry ? t.clockOut : t.clockIn}
            </button>
          </div>
        </section>

        {errorMessage && !isRequestModalOpen && (
          <p className='mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
            {errorMessage}
          </p>
        )}

        <section className='mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h2 className='text-lg font-semibold text-stone-900'>
                {t.missedShift}
              </h2>
              <p className='mt-1 text-sm leading-6 text-stone-500'>
                {t.missedShiftDescription}
              </p>
            </div>

            <button
              type='button'
              onClick={openMissedShiftForm}
              disabled={submitting}
              className='rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
            >
              {t.reportMissedShift}
            </button>
          </div>
        </section>

        <section className='rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
          <div className='mb-5 flex items-center justify-between gap-4'>
            <div>
              <h2 className='text-xl font-semibold text-stone-900'>
                {t.recentShifts}
              </h2>
              <p className='mt-1 text-sm text-stone-500'>
                {t.recentShiftsDescription}
              </p>
            </div>

            <button
              type='button'
              onClick={() =>
                Promise.all([loadEntries(), loadEmployeeCorrectionRequests()])
              }
              disabled={loading || submitting}
              className='rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
            >
              {t.refresh}
            </button>
          </div>

          {loading ? (
            <div className='py-10 text-center text-sm text-stone-500'>
              {t.loadingEntries}
            </div>
          ) : entries.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center'>
              <p className='font-medium text-stone-700'>{t.noShifts}</p>
              <p className='mt-1 text-sm text-stone-500'>
                {t.noShiftsDescription}
              </p>
            </div>
          ) : (
            <div className='divide-y divide-stone-200'>
              {entries.map((entry) => {
                const correction = getCorrectionForShift(entry.id)

                return (
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

                    <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
                      {!entry.clock_out && (
                        <span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'>
                          {t.active}
                        </span>
                      )}

                      <span className='rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700'>
                        {calculateDuration(entry.clock_in, entry.clock_out)}
                      </span>

                      {entry.clock_out &&
                        (correction ? (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              correction.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : correction.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {correction.status === 'pending'
                              ? t.correctionPending
                              : correction.status === 'approved'
                                ? t.correctionApproved
                                : t.correctionRejected}
                          </span>
                        ) : (
                          <button
                            type='button'
                            onClick={() => openCorrectionForm(entry)}
                            className='rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100'
                          >
                            {t.requestCorrection}
                          </button>
                        ))}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <footer className='py-6 text-center text-xs text-stone-500'>
          {t.employeeFooter}
        </footer>
      </div>

      {isRequestModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8'>
          <div className='max-h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8'>
            <div className='mb-6 flex items-start justify-between gap-4'>
              <div>
                <p className='text-xs font-semibold tracking-[0.2em] text-[#6f735f] uppercase'>
                  {requestMode === 'missing'
                    ? t.missedShift
                    : t.shiftCorrection}
                </p>

                <h2 className='mt-1 text-2xl font-semibold text-stone-900'>
                  {requestMode === 'missing'
                    ? t.reportMissedShift
                    : t.requestChange}
                </h2>

                <p className='mt-2 text-sm text-stone-500'>
                  {t.managerApprovalNotice}
                </p>
              </div>

              <button
                type='button'
                onClick={closeCorrectionForm}
                disabled={submitting}
                className='rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50'
              >
                {t.close}
              </button>
            </div>

            <form onSubmit={submitCorrectionRequest} className='space-y-5'>
              <div>
                <label
                  htmlFor='requested-clock-in'
                  className='mb-2 block text-sm font-semibold text-stone-700'
                >
                  {t.correctClockIn}
                </label>

                <input
                  id='requested-clock-in'
                  type='datetime-local'
                  value={requestedClockIn}
                  onChange={(event) => setRequestedClockIn(event.target.value)}
                  className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15'
                />
              </div>

              <div>
                <label
                  htmlFor='requested-clock-out'
                  className='mb-2 block text-sm font-semibold text-stone-700'
                >
                  {t.correctClockOut}
                </label>

                <input
                  id='requested-clock-out'
                  type='datetime-local'
                  value={requestedClockOut}
                  onChange={(event) => setRequestedClockOut(event.target.value)}
                  className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15'
                />
              </div>

              <div>
                <label
                  htmlFor='correction-reason'
                  className='mb-2 block text-sm font-semibold text-stone-700'
                >
                  {t.reason}
                </label>

                <textarea
                  id='correction-reason'
                  rows='4'
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder={t.reasonPlaceholder}
                  className='w-full resize-none rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15'
                />
              </div>

              {errorMessage && (
                <p className='rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
                  {errorMessage}
                </p>
              )}

              <button
                type='submit'
                disabled={submitting}
                className='w-full rounded-xl bg-[#2f352b] px-5 py-3.5 font-semibold text-white transition hover:bg-[#252a22] disabled:cursor-not-allowed disabled:opacity-50'
              >
                {submitting ? t.submitting : t.submitCorrection}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
