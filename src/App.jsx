import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { listOfflinePunches, recordOfflinePunch, removeSyncedPunch } from './offlinePunchStore'

const AUTO_LOGOUT_MINUTES = 5
const AUTO_LOGOUT_MS = AUTO_LOGOUT_MINUTES * 60 * 1000

// Names and IDs only. Never cache a PIN, PIN hash, shift, or payroll information.
// Including the Supabase URL keeps development and production rosters separate.
const ROSTER_CACHE_KEY = `shiftclock:roster:v1:${import.meta.env.VITE_SUPABASE_URL}`

function readCachedRoster() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROSTER_CACHE_KEY) || 'null')
    if (!saved || !Array.isArray(saved.employees)) return null
    if (typeof saved.savedAt !== 'number' || !Number.isFinite(saved.savedAt)) return null

    const employees = saved.employees.filter(
      (employee) =>
        typeof employee.id === 'string' &&
        typeof employee.name === 'string' &&
        employee.can_clock === true,
    )
    return { employees, savedAt: saved.savedAt }
  } catch {
    return null
  }
}

function isNetworkFailure(error) {
  if (!navigator.onLine) return true
  const message = String(error?.message ?? '')
  return /failed to fetch|fetch failed|networkerror|network request failed|err_internet_disconnected|econn|enotfound|timeout/i.test(message)
}

function saveRoster(employees, savedAt) {
  try {
    localStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify({
      savedAt,
      employees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        can_clock: true,
      })),
    }))
  } catch (error) {
    // The online clock still works if local storage is disabled or full.
    console.warn('Could not save employee roster locally:', error)
  }
}

function getStartOfWeek(date) {
  const result = new Date(date)
  const day = result.getDay()

  // Tuesday is 2 in JavaScript dates:
  // Sunday = 0, Monday = 1, Tuesday = 2, etc.
  const daysSinceTuesday = (day - 2 + 7) % 7

  result.setDate(result.getDate() - daysSinceTuesday)
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

function formatTwelveHourTime(value, options = {}) {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  })
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const translations = {
  en: {
    staffLabel: 'Hapgood Staff',
    employeeTimeClock: 'Time Clock',
    loginInstructions: 'Choose your name, then enter your PIN.',
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
    showRecentShifts: 'Show Recent Shifts',
    hideRecentShifts: 'Hide Recent Shifts',
    showAllShifts: 'Show All Shifts',
    loadingAllShifts: 'Loading all shifts...',
    showLessShifts: 'Show Less',
    recentShiftsPreview: 'Showing your 3 most recent shifts.',
    recentShiftsHidden:
      'Recent shifts are hidden. You can show them again if needed.',
    refresh: 'Refresh',
    loadingEntries: 'Loading entries...',
    noShifts: 'No shifts yet',
    noShiftsDescription: 'Your completed shifts will appear here.',
    active: 'Active',
    inProgress: 'In progress',
    requestCorrection: 'Request Correction',
    reportMissedShift: 'Report Missed Shift',
    missedShift: 'Missed Shift',
    clockInSuccess: 'You are clocked in.',
    clockOutSuccess: 'You are clocked out.',
    missedShiftDescription:
      'Forgot to clock in for a whole shift? Submit a request for manager approval.',
    correctionPending: 'Correction pending',
    correctionApproved: 'Correction approved',
    correctionRejected: 'Correction rejected',
    employeeFooter: 'Hapgood Employee Time Clock',
    managerDashboard: 'Manager Dashboard',
    shiftCorrection: 'Shift Correction',
    requestChange: 'Request a change',
    managerApprovalNotice: 'This request must be approved by a manager.',
    close: 'Close',
    correctClockIn: 'Correct clock-in',
    correctClockOut: 'Correct clock-out',
    reason: 'Reason',
    reasonTooShort: 'Please enter a reason (at least 3 characters).',
    offlinePunchHeading: 'Offline punch · unverified',
    offlinePunchExplainer: 'Choose your name, then record a clock-in or clock-out. No PIN can be verified offline. The punch stays on this device until a manager syncs and approves it. It is NOT yet payroll time.',
    offlineClockIn: 'Record offline clock-in',
    offlineClockOut: 'Record offline clock-out',
    offlineSaved: 'Saved on this device. A manager must sync and review it before it counts toward payroll.',
    offlineStoreError: 'Could not save this punch. Please notify a manager and write down the time.',
    offlineQueued: 'Unsynced punches on this device',

    connectionUnavailable: 'Unable to reach ShiftClock. Online clock-in and PIN verification are unavailable.',
    cachedRosterNotice: 'Showing the last saved employee list. Names may be out of date.',
    noCachedRoster: 'Connect to the internet once to save the employee list on this device.',
    savedRosterAt: 'Employee list saved',
    retryConnection: 'Retry connection',
    offlineLogin: 'No hours have been recorded. Please reconnect before clocking in or out.',
    pinServerError: 'Could not reach the server to verify your PIN. Try again when connected.',
    offlineActionsNote: 'Clocking in, corrections, and manager changes require a connection.',
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
      overlapsExistingShift:
        'This time overlaps an existing shift. Please check the times or ask a manager.',
      overlapsPendingRequest:
        'A pending request already overlaps this time. Please wait for a manager to review it.',
      correctionSubmitFailed: 'Could not submit correction request.',
      missedShiftSubmitFailed: 'Could not submit missed shift request.',
    },
  },
  es: {
    staffLabel: 'Personal de Hapgood',
    employeeTimeClock: 'Reloj',
    loginInstructions: 'Selecciona tu nombre e ingresa tu PIN.',
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
    showRecentShifts: 'Mostrar turnos recientes',
    hideRecentShifts: 'Ocultar turnos recientes',
    showAllShifts: 'Mostrar todos los turnos',
    loadingAllShifts: 'Cargando todos los turnos...',
    showLessShifts: 'Mostrar menos',
    recentShiftsPreview: 'Mostrando tus 3 turnos más recientes.',
    recentShiftsHidden:
      'Los turnos recientes están ocultos. Puedes mostrarlos de nuevo si es necesario.',
    refresh: 'Actualizar',
    loadingEntries: 'Cargando registros...',
    noShifts: 'Aún no hay turnos',
    noShiftsDescription: 'Tus turnos completados aparecerán aquí.',
    active: 'Activo',
    inProgress: 'En curso',
    requestCorrection: 'Solicitar corrección',
    reportMissedShift: 'Reportar turno olvidado',
    missedShift: 'Turno olvidado',
    clockInSuccess: 'Entrada registrada.',
    clockOutSuccess: 'Salida registrada.',
    missedShiftDescription:
      '¿Olvidaste marcar entrada durante un turno completo? Envía una solicitud para aprobación del gerente.',
    correctionPending: 'Corrección pendiente',
    correctionApproved: 'Corrección aprobada',
    correctionRejected: 'Corrección rechazada',
    employeeFooter: 'Reloj de empleados de Hapgood',
    managerDashboard: 'Manager Dashboard',
    shiftCorrection: 'Corrección de turno',
    requestChange: 'Solicitar un cambio',
    managerApprovalNotice: 'Esta solicitud debe ser aprobada por un gerente.',
    close: 'Cerrar',
    correctClockIn: 'Hora correcta de entrada',
    correctClockOut: 'Hora correcta de salida',
    reason: 'Motivo',
    reasonTooShort: 'Escribe un motivo (al menos 3 caracteres).',
    offlinePunchHeading: 'Registro sin conexión · sin verificar',
    offlinePunchExplainer: 'Selecciona tu nombre y registra entrada o salida. Sin internet no se puede verificar el PIN. El registro queda en este dispositivo hasta que el gerente lo sincronice y apruebe. Aún NO cuenta como horas de nómina.',
    offlineClockIn: 'Guardar entrada sin conexión',
    offlineClockOut: 'Guardar salida sin conexión',
    offlineSaved: 'Guardado en este dispositivo. El gerente debe sincronizarlo y revisarlo antes de contar las horas.',
    offlineStoreError: 'No se pudo guardar. Avisa al gerente y anota la hora.',
    offlineQueued: 'Registros pendientes de sincronizar',

    connectionUnavailable: 'Sin conexión con ShiftClock. No se puede registrar la entrada ni verificar el PIN.',
    cachedRosterNotice: 'Se muestra la última lista de empleados guardada. Puede estar desactualizada.',
    noCachedRoster: 'Conéctate a internet una vez para guardar la lista de empleados en este dispositivo.',
    savedRosterAt: 'Lista de empleados guardada',
    retryConnection: 'Reintentar conexión',
    offlineLogin: 'No se registraron horas. Conéctate antes de marcar entrada o salida.',
    pinServerError: 'No se pudo conectar al servidor para verificar el PIN. Inténtalo cuando haya conexión.',
    offlineActionsNote: 'Para registrar horas o hacer cambios se necesita conexión.',
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
      overlapsExistingShift:
        'Este horario se superpone con un turno existente. Revisa las horas o habla con un gerente.',
      overlapsPendingRequest:
        'Ya hay una solicitud pendiente que se superpone con este horario. Espera a que un gerente la revise.',
      correctionSubmitFailed: 'No se pudo enviar la solicitud de corrección.',
      missedShiftSubmitFailed:
        'No se pudo enviar la solicitud de turno olvidado.',
    },
  },
}

// Same clipped-duration calculation used by the manager's date-range reports.
// Request previews never write to time_entries; only approval does.
function clippedShiftSeconds(clockIn, clockOut, rangeStart, rangeEnd) {
  if (!clockIn) return 0
  const start = new Date(clockIn).getTime()
  const end = clockOut ? new Date(clockOut).getTime() : Date.now()
  const beginning = Math.max(start, rangeStart)
  const ending = Math.min(end, rangeEnd)
  if (![start, end, rangeStart, rangeEnd].every(Number.isFinite)) return 0
  return Math.max(0, (ending - beginning) / 1000)
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

function ConnectionNotice({ t, usingCachedRoster, rosterSavedAt, onRetry, loading, showRosterDetails = true }) {
  return (
    <div role='status' className='mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950'>
      <p className='font-semibold'>{t.connectionUnavailable}</p>
      <p className='mt-2'>
        {showRosterDetails
          ? (usingCachedRoster ? t.cachedRosterNotice : t.noCachedRoster)
          : t.offlineActionsNote}
      </p>
      {showRosterDetails && usingCachedRoster && rosterSavedAt && (
        <p className='mt-1 text-xs text-amber-800'>
          {t.savedRosterAt}: {formatDateTime(rosterSavedAt)}
        </p>
      )}
      <button
        type='button'
        onClick={onRetry}
        disabled={loading}
        className='mt-3 rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50'
      >
        {t.retryConnection}
      </button>
    </div>
  )
}

function App() {
  const isManagerRoute = window.location.pathname === '/manager'

  const [employees, setEmployees] = useState([])
  const [offlineQueue, setOfflineQueue] = useState([])
  const [pendingOfflinePunches, setPendingOfflinePunches] = useState([])
  const [offlineNotice, setOfflineNotice] = useState('')
  const [offlineBusy, setOfflineBusy] = useState(false)
  const [offlineReviewBusyId, setOfflineReviewBusyId] = useState(null)
  const [offlineOutSelections, setOfflineOutSelections] = useState({})
  const [offlineNotes, setOfflineNotes] = useState({})
  const [offlineReviewLoadFailed, setOfflineReviewLoadFailed] = useState(false)

  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [serverUnavailable, setServerUnavailable] = useState(false)
  const [usingCachedRoster, setUsingCachedRoster] = useState(false)
  const [rosterSavedAt, setRosterSavedAt] = useState(null)
  const connectionUnavailable = !browserOnline || serverUnavailable
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
  const [hideRecentShifts, setHideRecentShifts] = useState(false)
  const [showAllRecentShifts, setShowAllRecentShifts] = useState(false)
  const [loadingAllShifts, setLoadingAllShifts] = useState(false)
  const [allRecentShiftsLoaded, setAllRecentShiftsLoaded] = useState(false)
  const [correctionRequests, setCorrectionRequests] = useState([])
  const [pendingCorrections, setPendingCorrections] = useState([])

  const [selectedShift, setSelectedShift] = useState(null)
  const [requestMode, setRequestMode] = useState('correction')
  const [requestedClockIn, setRequestedClockIn] = useState('')
  const [requestedClockOut, setRequestedClockOut] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [showReasonWarning, setShowReasonWarning] = useState(false)

  const [activeManagerNoteId, setActiveManagerNoteId] = useState(null)
  const [reviewingRequestId, setReviewingRequestId] = useState(null)
  const [managerNote, setManagerNote] = useState('')
  const [pendingLoadFailed, setPendingLoadFailed] = useState(false)
  const [pendingEditRequest, setPendingEditRequest] = useState(null)
  const [pendingEditClockIn, setPendingEditClockIn] = useState('')
  const [pendingEditClockOut, setPendingEditClockOut] = useState('')
  const [pendingEditReason, setPendingEditReason] = useState('')

  const [clockableEmployees, setClockableEmployees] = useState([])
  const [managerShiftFormMode, setManagerShiftFormMode] = useState(null)
  const [managerShiftFormShift, setManagerShiftFormShift] = useState(null)
  const [managerShiftEmployeeId, setManagerShiftEmployeeId] = useState('')
  const [managerShiftClockIn, setManagerShiftClockIn] = useState('')
  const [managerShiftClockOut, setManagerShiftClockOut] = useState('')
  const [managerShiftReason, setManagerShiftReason] = useState('')

  const currentWeekStart = getStartOfWeek(new Date())

  const [startDate, setStartDate] = useState(() =>
    formatDateForInput(currentWeekStart),
  )

  const [endDate, setEndDate] = useState(() =>
    formatDateForInput(addDays(currentWeekStart, 6)),
  )

  const [appliedStartDate, setAppliedStartDate] = useState(() => formatDateForInput(currentWeekStart))
  const [appliedEndDate, setAppliedEndDate] = useState(() => formatDateForInput(addDays(currentWeekStart, 6)))

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    void loadEmployees()
    void refreshOfflineQueue()

    function handleOnline() {
      setBrowserOnline(true)
      void loadEmployees()
      void refreshOfflineQueue()
    }

    function handleOffline() {
      setBrowserOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!successMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage('')
    }, 2500)

    return () => window.clearTimeout(timeoutId)
  }, [successMessage])

  useEffect(() => {
    if (!loggedInEmployee) {
      return undefined
    }

    let logoutTimerId

    function resetLogoutTimer() {
      window.clearTimeout(logoutTimerId)

      logoutTimerId = window.setTimeout(() => {
        logOut()
      }, AUTO_LOGOUT_MS)
    }

    const activityEvents = [
      'click',
      'touchstart',
      'touchmove',
      'pointerdown',
      'pointermove',
      'keydown',
      'scroll',
      'wheel',
      'visibilitychange',
    ]

    resetLogoutTimer()

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetLogoutTimer)
    })

    return () => {
      window.clearTimeout(logoutTimerId)

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetLogoutTimer)
      })
    }
  }, [loggedInEmployee])

  useEffect(() => {
    if (!loggedInEmployee && pin.length === 4 && !submitting && !loading) {
      logIn(null, pin)
    }
  }, [pin, loggedInEmployee, submitting, loading])

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage)
    localStorage.setItem('employeeLanguage', nextLanguage)
  }

  function addPinDigit(digit) {
    if (submitting) {
      return
    }

    setPin((currentPin) => `${currentPin}${digit}`.slice(0, 4))
  }

  function removePinDigit() {
    if (submitting) {
      return
    }

    setPin((currentPin) => currentPin.slice(0, -1))
  }

  function clearPin() {
    if (submitting) {
      return
    }

    setPin('')
  }

  async function refreshOfflineQueue() {
    try {
      setOfflineQueue(await listOfflinePunches())
    } catch (error) {
      console.error('Could not read offline punch queue:', error)
      setOfflineNotice(translations[isManagerRoute ? 'en' : language].offlineStoreError)
    }
  }

  async function saveOfflineEvent(eventType) {
    if (offlineBusy || !connectionUnavailable || isManagerRoute) return
    const employee = employees.find((item) => item.id === selectedEmployeeId)
    if (!employee) {
      setOfflineNotice(t.errors.employeeNotFound)
      return
    }
    setOfflineBusy(true)
    setOfflineNotice('')
    try {
      // These are *claims* made from a shared device, not verified time entries.
      const punch = await recordOfflinePunch({
        employeeId: employee.id,
        employeeName: employee.name,
        eventType,
      })
      await refreshOfflineQueue()
      setOfflineNotice(`${t.offlineSaved} ${formatDateTime(punch.occurred_at)}`)
    } catch (error) {
      console.error('Could not save offline punch:', error)
      setOfflineNotice(t.offlineStoreError)
    } finally {
      setOfflineBusy(false)
    }
  }

  async function loadPendingOfflinePunches(
    managerId = loggedInEmployee?.id,
    managerPin = pin,
  ) {
    if (!managerId || !managerPin) return
    const { data, error } = await supabase.rpc('get_pending_offline_punches', {
      p_manager_id: managerId,
      p_manager_pin: managerPin,
    })
    if (error) {
      console.error('Could not load offline punches:', error)
      setOfflineReviewLoadFailed(true)
      setPendingOfflinePunches([])
    } else {
      setOfflineReviewLoadFailed(false)
      setPendingOfflinePunches(data ?? [])
    }
  }

  async function syncOfflineQueue() {
    if (!isManagerRoute || !loggedInEmployee || offlineBusy || connectionUnavailable) return
    setOfflineBusy(true)
    setErrorMessage('')
    try {
      // Manager authentication is required for *each* RPC; this is not
      // an anonymous auto-sync and nothing goes directly into payroll.
      const punches = await listOfflinePunches()
      let synced = 0
      for (const punch of punches) {
        const { error } = await supabase.rpc('submit_offline_punch_for_review', {
          p_manager_id: loggedInEmployee.id,
          p_manager_pin: pin,
          p_event_id: punch.id,
          p_employee_id: punch.employee_id,
          p_event_type: punch.event_type,
          p_occurred_at: punch.occurred_at,
          p_device_id: punch.device_id,
        })
        if (error) throw error
        // Delete only after server acknowledgment. Retried UUIDs are idempotent.
        await removeSyncedPunch(punch.id)
        synced += 1
      }
      setSuccessMessage(`${synced} offline punches synced for manager review. None were added to payroll.`)
      await loadPendingOfflinePunches()
    } catch (error) {
      console.error('Offline sync failed:', error)
      setErrorMessage(`Offline sync interrupted: ${error.message}. Unsynced punches remain on this device.`)
    } finally {
      await refreshOfflineQueue()
      setOfflineBusy(false)
    }
  }

  function offlineForEmployee(employeeId) {
    return pendingOfflinePunches.filter((event) => event.employee_id === employeeId)
  }

  async function approveOfflinePair(inEvent, outEventId) {
    const note = (offlineNotes[inEvent.id] || '').trim()
    if (!outEventId || note.length < 3) {
      setErrorMessage('Choose a matching clock-out and enter an approval reason (at least 3 characters).')
      return
    }
    setOfflineReviewBusyId(inEvent.id)
    setErrorMessage('')
    const { error } = await supabase.rpc('manager_approve_offline_pair', {
      p_manager_id: loggedInEmployee.id,
      p_manager_pin: pin,
      p_clock_in_event_id: inEvent.id,
      p_clock_out_event_id: outEventId,
      p_manager_note: note,
    })
    if (error) {
      console.error('Offline approval failed:', error)
      setErrorMessage(error.message || 'Could not approve these punches.')
    } else {
      setOfflineOutSelections((old) => ({ ...old, [inEvent.id]: '' }))
      setSuccessMessage('Offline shift reviewed and added to recorded hours.')
      await refreshManagerDashboard()
    }
    setOfflineReviewBusyId(null)
  }

  async function rejectOfflinePunch(eventId) {
    const note = (offlineNotes[eventId] || '').trim()
    if (note.length < 3) {
      setErrorMessage('Enter a rejection reason (at least 3 characters).')
      return
    }
    setOfflineReviewBusyId(eventId)
    setErrorMessage('')
    const { error } = await supabase.rpc('manager_reject_offline_punch', {
      p_manager_id: loggedInEmployee.id,
      p_manager_pin: pin,
      p_event_id: eventId,
      p_manager_note: note,
    })
    if (error) {
      console.error('Offline rejection failed:', error)
      setErrorMessage(error.message || 'Could not reject this punch.')
    } else {
      setSuccessMessage('Unverified offline punch rejected. Recorded hours unchanged.')
      await refreshManagerDashboard()
    }
    setOfflineReviewBusyId(null)
  }

  async function loadEmployees() {
    setLoading(true)
    setErrorMessage('')
    setBrowserOnline(navigator.onLine)

    const employeeListFunction = isManagerRoute
      ? 'list_active_managers'
      : 'list_clockable_employees'

    const { data, error } = await supabase.rpc(employeeListFunction)

    if (error) {
      console.error('Employee list fetch failed:', error)
      const isDisconnected = isNetworkFailure(error)
      setServerUnavailable(isDisconnected)

      // Manager accounts aren't cached; don't mistake API permission errors for being offline.
      const saved = isDisconnected && !isManagerRoute ? readCachedRoster() : null
      if (saved) {
        setEmployees(saved.employees)
        setSelectedEmployeeId((current) =>
          saved.employees.some((employee) => employee.id === current)
            ? current
            : saved.employees[0]?.id || '',
        )
        setUsingCachedRoster(true)
        setRosterSavedAt(saved.savedAt)
      } else {
        setEmployees([])
        setSelectedEmployeeId('')
        setUsingCachedRoster(false)
        setRosterSavedAt(null)
      }
      if (!isDisconnected) {
        setErrorMessage(translations[isManagerRoute ? 'en' : language].errors.loadEmployees)
      }
    } else {
      const employeeList = data ?? []
      setServerUnavailable(false)
      setEmployees(employeeList)
      setSelectedEmployeeId((current) =>
        employeeList.some((employee) => employee.id === current)
          ? current
          : employeeList[0]?.id || '',
      )
      setUsingCachedRoster(false)
      if (!isManagerRoute) {
        const savedAt = Date.now()
        saveRoster(employeeList, savedAt)
        setRosterSavedAt(savedAt)
      }
    }

    setLoading(false)
  }

  async function loadClockableEmployees() {
    const { data, error } = await supabase.rpc('list_clockable_employees')

    if (error) {
      console.error(error)
      setClockableEmployees([])
      return []
    }

    setClockableEmployees(data ?? [])
    return data ?? []
  }

  async function logIn(event = null, pinOverride = pin) {
    event?.preventDefault()

    if (connectionUnavailable) {
      setErrorMessage(loginT.offlineLogin)
      setPin('')
      return
    }

    const pinToUse = pinOverride

    if (!selectedEmployeeId || pinToUse.length !== 4) {
      setErrorMessage(loginT.errors.loginFields)
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('verify_employee_pin', {
      p_employee_id: selectedEmployeeId,
      p_pin: pinToUse,
    })

    if (error) {
      console.error('PIN verification failed:', error)
      const isDisconnected = isNetworkFailure(error)
      setServerUnavailable(isDisconnected)
      setErrorMessage(isDisconnected ? loginT.pinServerError : error.message || loginT.pinServerError)
      setPin('')
      setSubmitting(false)
      return
    }

    if (data !== true) {
      setErrorMessage(loginT.errors.incorrectPin)
      setPin('')
      setSubmitting(false)
      return
    }

    setServerUnavailable(false)
    const employee = employees.find((item) => item.id === selectedEmployeeId)

    if (!employee) {
      setErrorMessage(loginT.errors.employeeNotFound)
      setPin('')
      setSubmitting(false)
      return
    }

    if (isManagerRoute && employee.role !== 'manager') {
      setErrorMessage('Manager access required.')
      setPin('')
      setSubmitting(false)
      return
    }

    if (!isManagerRoute && employee.can_clock === false) {
      setErrorMessage(loginT.errors.employeeNotFound)
      setPin('')
      setSubmitting(false)
      return
    }

    setLoggedInEmployee(employee)
    setSuccessMessage('')
    setHideRecentShifts(false)
    setShowAllRecentShifts(false)
    setAllRecentShiftsLoaded(false)
    setAllRecentShiftsLoaded(false)

    if (isManagerRoute) {
      await Promise.all([
        refreshManagerDashboard(employee.id, pinToUse),
        loadClockableEmployees(),
      ])
    } else {
      await Promise.all([
        loadEntries(employee.id, pinToUse),
        loadEmployeeCorrectionRequests(employee.id, pinToUse),
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
      setAllRecentShiftsLoaded(false)
    }

    setLoading(false)
  }

  async function loadAllEmployeeEntries(
    employeeId = loggedInEmployee?.id,
    employeePin = pin,
  ) {
    if (!employeeId || !employeePin) {
      return false
    }

    setLoadingAllShifts(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('get_employee_all_entries', {
      p_employee_id: employeeId,
      p_pin: employeePin,
    })

    if (error) {
      console.error(error)
      setErrorMessage(t.errors.loadEntries)
      setLoadingAllShifts(false)
      return false
    }

    setEntries(data ?? [])
    setAllRecentShiftsLoaded(true)
    setLoadingAllShifts(false)
    return true
  }

  async function toggleShowAllRecentShifts() {
    if (showAllRecentShifts) {
      setShowAllRecentShifts(false)
      return
    }

    if (!allRecentShiftsLoaded) {
      const loaded = await loadAllEmployeeEntries()

      if (!loaded) {
        return
      }
    }

    setShowAllRecentShifts(true)
  }

  async function loadManagerTotals(
    managerId = loggedInEmployee?.id,
    managerPin = pin,
    reportStartDate = startDate,
    reportEndDate = endDate,
  ) {
    if (!managerId || !managerPin || !reportStartDate || !reportEndDate) {
      return
    }

    if (new Date(reportStartDate) > new Date(reportEndDate)) {
      setErrorMessage('The start date must be before the end date.')
      return
    }

    setLoading(true)
    setErrorMessage('')

    const rangeStart = new Date(`${reportStartDate}T00:00:00`)
    const rangeEnd = new Date(`${reportEndDate}T00:00:00`)
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
      setAppliedStartDate(reportStartDate)
      setAppliedEndDate(reportEndDate)
    }

    setLoading(false)
  }

  async function refreshManagerDashboard(
    managerId = loggedInEmployee?.id,
    managerPin = pin,
    reportStartDate = startDate,
    reportEndDate = endDate,
  ) {
    await Promise.all([
      loadManagerTotals(managerId, managerPin, reportStartDate, reportEndDate),
      loadPendingCorrections(managerId, managerPin),
      loadPendingOfflinePunches(managerId, managerPin),
    ])
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
      setPendingLoadFailed(true)
      setErrorMessage('Could not load pending correction requests. Provisional totals may be incomplete.')
      setPendingCorrections([])
    } else {
      setPendingLoadFailed(false)
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
  const isManagerShiftFormOpen =
    managerShiftFormMode === 'add' || managerShiftFormMode === 'edit'
  const displayedEntries = hideRecentShifts
    ? []
    : showAllRecentShifts
      ? entries
      : entries.slice(0, 3)
  const hasMoreRecentShifts = !hideRecentShifts && entries.length > 3

  async function clockIn() {
    if (!loggedInEmployee || activeEntry || submitting || isManagerRoute) {
      return
    }
    if (connectionUnavailable) {
      setErrorMessage(t.offlineLogin)
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
      setSuccessMessage(t.clockInSuccess)
    }

    setSubmitting(false)
  }

  async function clockOut() {
    if (!loggedInEmployee || !activeEntry || submitting || isManagerRoute) {
      return
    }
    if (connectionUnavailable) {
      setErrorMessage(t.offlineLogin)
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
      setSuccessMessage(t.clockOutSuccess)
    }

    setSubmitting(false)
  }

  function openCorrectionForm(entry) {
    setRequestMode('correction')
    setSelectedShift(entry)
    setRequestedClockIn(formatDateTimeForInput(entry.clock_in))
    setRequestedClockOut(formatDateTimeForInput(entry.clock_out))
    setCorrectionReason('')
    setShowReasonWarning(false)
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
    setShowReasonWarning(false)
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
    setShowReasonWarning(false)
    setErrorMessage('')
  }

  function getFriendlyRequestError(error, fallbackMessage) {
    const message = error?.message ?? ''

    if (
      message.includes('overlaps an existing shift') ||
      message.includes('overlaps another existing shift') ||
      message.includes('no_overlapping_completed_shifts') ||
      message.includes('conflicting key value violates exclusion constraint')
    ) {
      return t.errors.overlapsExistingShift
    }

    if (
      message.includes('pending request already overlaps') ||
      message.includes('A pending request already overlaps')
    ) {
      return t.errors.overlapsPendingRequest
    }

    if (message.includes('already pending')) {
      return t.errors.correctionPending
    }

    if (message.includes('Clock-out must be after clock-in')) {
      return t.errors.invalidTimeOrder
    }

    return fallbackMessage
  }

  function getFriendlyManagerReviewError(error) {
    const message = error?.message ?? ''

    if (
      message.includes('overlap') ||
      message.includes('no_overlapping_completed_shifts') ||
      message.includes('conflicting key value violates exclusion constraint')
    ) {
      return 'This approval would create overlapping shifts. Reject this request or remove the conflicting shift first.'
    }

    if (message.includes('manager_approve_edited_request') || message.includes('schema cache')) {
      return 'The Edit & Approve database function is not installed. Run the companion SQL file in Supabase.'
    }

    return error?.message || 'Could not review request.'
  }

  function getFriendlyManagerShiftError(error) {
    const message = error?.message ?? ''

    if (
      message.includes('overlaps') ||
      message.includes('overlap') ||
      message.includes('no_overlapping_completed_shifts') ||
      message.includes('conflicting key value violates exclusion constraint')
    ) {
      return 'This shift overlaps an existing shift. Check the employee, date, and times.'
    }

    if (message.includes('Clock-out time must be after clock-in time')) {
      return 'Clock-out must be after clock-in.'
    }

    if (message.includes('Edit reason is required')) {
      return 'Enter a reason before saving this manager edit.'
    }

    if (message.includes('Invalid manager credentials')) {
      return 'Manager PIN verification failed. Sign out and sign back in.'
    }

    return 'Could not save manager shift edit.'
  }

  function resetManagerShiftForm() {
    setManagerShiftFormMode(null)
    setManagerShiftFormShift(null)
    setManagerShiftEmployeeId('')
    setManagerShiftClockIn('')
    setManagerShiftClockOut('')
    setManagerShiftReason('')
  }

  function closeManagerShiftForm() {
    if (submitting) {
      return
    }

    resetManagerShiftForm()
    setErrorMessage('')
  }

  function openManagerAddShiftForm(employeeId = '') {
    const defaultClockIn = new Date()
    defaultClockIn.setHours(9, 0, 0, 0)

    const defaultClockOut = new Date(defaultClockIn)
    defaultClockOut.setHours(15, 0, 0, 0)

    setManagerShiftFormMode('add')
    setManagerShiftFormShift(null)
    setManagerShiftEmployeeId(employeeId || clockableEmployees[0]?.id || '')
    setManagerShiftClockIn(formatDateTimeForInput(defaultClockIn))
    setManagerShiftClockOut(formatDateTimeForInput(defaultClockOut))
    setManagerShiftReason('')
    setErrorMessage('')
  }

  function openManagerEditShiftForm(shift) {
    const fallbackClockOut = new Date()
    fallbackClockOut.setSeconds(0, 0)

    setManagerShiftFormMode('edit')
    setManagerShiftFormShift(shift)
    setManagerShiftEmployeeId(shift.employee_id)
    setManagerShiftClockIn(formatDateTimeForInput(shift.clock_in))
    setManagerShiftClockOut(
      formatDateTimeForInput(shift.clock_out ?? fallbackClockOut),
    )
    setManagerShiftReason('')
    setErrorMessage('')
  }

  async function submitManagerShiftForm(event) {
    event.preventDefault()
    if (connectionUnavailable) {
      setErrorMessage('Connection required to save manager edits.')
      return
    }

    if (
      !managerShiftClockIn ||
      !managerShiftClockOut ||
      managerShiftReason.trim().length < 3 ||
      (managerShiftFormMode === 'add' && !managerShiftEmployeeId) ||
      (managerShiftFormMode === 'edit' && !managerShiftFormShift)
    ) {
      setErrorMessage('Choose an employee, enter both times, and add a reason.')
      return
    }

    const clockInDate = new Date(managerShiftClockIn)
    const clockOutDate = new Date(managerShiftClockOut)

    if (clockOutDate <= clockInDate) {
      setErrorMessage('Clock-out must be after clock-in.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const rpcName =
      managerShiftFormMode === 'add'
        ? 'manager_create_manual_shift'
        : 'manager_update_time_entry'

    const rpcPayload =
      managerShiftFormMode === 'add'
        ? {
            p_manager_id: loggedInEmployee.id,
            p_manager_pin: pin,
            p_employee_id: managerShiftEmployeeId,
            p_clock_in: clockInDate.toISOString(),
            p_clock_out: clockOutDate.toISOString(),
            p_edit_reason: managerShiftReason.trim(),
          }
        : {
            p_manager_id: loggedInEmployee.id,
            p_manager_pin: pin,
            p_time_entry_id: managerShiftFormShift.entry_id,
            p_clock_in: clockInDate.toISOString(),
            p_clock_out: clockOutDate.toISOString(),
            p_edit_reason: managerShiftReason.trim(),
          }

    const { error } = await supabase.rpc(rpcName, rpcPayload)

    if (error) {
      console.error(error)
      setErrorMessage(getFriendlyManagerShiftError(error))
      setSubmitting(false)
      return
    }

    await refreshManagerDashboard()
    setSuccessMessage(
      managerShiftFormMode === 'add' ? 'Shift added.' : 'Shift updated.',
    )
    resetManagerShiftForm()
    setSubmitting(false)
  }

  async function submitCorrectionRequest(event) {
    event.preventDefault()
    if (connectionUnavailable) {
      setErrorMessage(t.offlineLogin)
      return
    }

    const hasMissingTimes =
      (requestMode === 'correction' && !selectedShift) ||
      !requestedClockIn ||
      !requestedClockOut
    const reasonTooShort = correctionReason.trim().length < 3
    setShowReasonWarning(reasonTooShort)

    if (hasMissingTimes || reasonTooShort) {
      // Keep the reason error next to its field so it is visible in the modal.
      setErrorMessage(
        hasMissingTimes
          ? requestMode === 'missing'
            ? t.errors.missedShiftFields
            : t.errors.correctionFields
          : '',
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

      setErrorMessage(
        getFriendlyRequestError(
          error,
          requestMode === 'missing'
            ? t.errors.missedShiftSubmitFailed
            : t.errors.correctionSubmitFailed,
        ),
      )
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
    if (connectionUnavailable) {
      setErrorMessage('Connection required to review requests.')
      return
    }

    if (decision === 'approved') {
      const request = pendingCorrections.find((item) => item.request_id === requestId)
      const proposedHours = request
        ? (new Date(request.requested_clock_out) - new Date(request.requested_clock_in)) / 3600000
        : 0
      if (proposedHours > 16 && !window.confirm(
        `This request spans ${proposedHours.toFixed(1)} hours. Double-check the dates and times before approving. Continue?`,
      )) return
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
      setErrorMessage(getFriendlyManagerReviewError(error))
    } else {
      setManagerNote('')
      setActiveManagerNoteId(null)

      await refreshManagerDashboard()
      setSuccessMessage(decision === 'approved' ? 'Correction approved.' : 'Request rejected.')
    }

    setReviewingRequestId(null)
  }

  function openPendingRequestEditor(request) {
    setPendingEditRequest(request)
    setPendingEditClockIn(formatDateTimeForInput(request.requested_clock_in))
    setPendingEditClockOut(formatDateTimeForInput(request.requested_clock_out))
    setPendingEditReason('')
    setErrorMessage('')
  }

  function closePendingRequestEditor() {
    if (submitting) return
    setPendingEditRequest(null)
    setPendingEditClockIn('')
    setPendingEditClockOut('')
    setPendingEditReason('')
    setErrorMessage('')
  }

  async function submitEditedPendingRequest(event) {
    event.preventDefault()
    if (!pendingEditRequest || submitting || reviewingRequestId) return
    if (connectionUnavailable) {
      setErrorMessage('Connection required to approve an edited request.')
      return
    }

    const clockIn = new Date(pendingEditClockIn)
    const clockOut = new Date(pendingEditClockOut)
    if (
      !pendingEditClockIn || !pendingEditClockOut ||
      !Number.isFinite(clockIn.getTime()) ||
      !Number.isFinite(clockOut.getTime()) ||
      clockOut <= clockIn ||
      pendingEditReason.trim().length < 3
    ) {
      setErrorMessage('Enter valid clock-in/out times and a reason of at least 3 characters.')
      return
    }

    const proposedHours = (clockOut - clockIn) / 3600000
    if (proposedHours > 16 && !window.confirm(
      `These times span ${proposedHours.toFixed(1)} hours. Please confirm the dates before saving. Continue?`,
    )) return

    setSubmitting(true)
    setErrorMessage('')
    const { error } = await supabase.rpc('manager_approve_edited_request', {
      p_manager_id: loggedInEmployee.id,
      p_manager_pin: pin,
      p_request_id: pendingEditRequest.request_id,
      p_clock_in: clockIn.toISOString(),
      p_clock_out: clockOut.toISOString(),
      p_edit_reason: pendingEditReason.trim(),
    })

    if (error) {
      console.error(error)
      setErrorMessage(getFriendlyManagerReviewError(error))
    } else {
      setPendingEditRequest(null)
      setPendingEditClockIn('')
      setPendingEditClockOut('')
      setPendingEditReason('')
      await refreshManagerDashboard()
      setSuccessMessage('Corrected times approved.')
    }
    setSubmitting(false)
  }

  function getCorrectionForShift(timeEntryId) {
    const requestsForShift = correctionRequests.filter(
      (request) => request.time_entry_id === timeEntryId,
    )

    // A pending request always takes priority over earlier reviewed requests.
    return (
      requestsForShift.find((request) => request.status === 'pending') ??
      requestsForShift[0] ??
      null
    )
  }

  function logOut() {
    const beginning = getStartOfWeek(new Date())

    setCorrectionRequests([])
    setPendingCorrections([])
    setPendingOfflinePunches([])
    setOfflineNotes({})
    setOfflineOutSelections({})
    setOfflineNotice('')
    setSelectedShift(null)
    setRequestMode('correction')
    setRequestedClockIn('')
    setRequestedClockOut('')
    setCorrectionReason('')
    setShowReasonWarning(false)
    setManagerNote('')
    setActiveManagerNoteId(null)
    setReviewingRequestId(null)
    setPendingLoadFailed(false)
    setPendingEditRequest(null)
    setPendingEditClockIn('')
    setPendingEditClockOut('')
    setPendingEditReason('')
    setLoggedInEmployee(null)
    setPin('')
    setEntries([])
    setManagerTotals([])
    setManagerShifts([])
    setExpandedEmployeeId(null)
    setHideRecentShifts(false)
    setShowAllRecentShifts(false)
    setAllRecentShiftsLoaded(false)
    setErrorMessage('')
    setSuccessMessage('')
    setStartDate(formatDateForInput(beginning))
    setEndDate(formatDateForInput(addDays(beginning, 6)))
    setAppliedStartDate(formatDateForInput(beginning))
    setAppliedEndDate(formatDateForInput(addDays(beginning, 6)))
  }

  function formatTime(value) {
    return formatTwelveHourTime(value)
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

  function escapeCsvValue(value) {
    if (value === null || value === undefined) {
      return ''
    }

    const stringValue = String(value)

    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }

    return stringValue
  }

  function formatCsvDateTime(value) {
    if (!value) {
      return ''
    }

    return formatDateTime(value)
  }

  function exportPayrollCsv() {
    if (!managerShifts.length) {
      setErrorMessage(
        'No shift details are available to export for this date range.',
      )
      return
    }

    const headers = [
      'Employee',
      'Date',
      'Clock In',
      'Clock Out',
      'Duration',
      'Status',
      'Edited',
      'Edited At',
      'Edit Reason',
    ]

    const rows = managerShifts.map((shift) => ({
      Employee: shift.employee_name,
      Date: new Date(shift.clock_in).toLocaleDateString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
      'Clock In': formatCsvDateTime(shift.clock_in),
      'Clock Out': shift.clock_out ? formatCsvDateTime(shift.clock_out) : '',
      Duration: calculateDuration(shift.clock_in, shift.clock_out),
      Status: shift.clock_out ? 'Completed' : 'Active',
      Edited: shift.edited_at ? 'Yes' : 'No',
      'Edited At': shift.edited_at ? formatCsvDateTime(shift.edited_at) : '',
      'Edit Reason': shift.edit_reason ?? '',
    }))

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => escapeCsvValue(row[header])).join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeStart = startDate || 'start'
    const safeEnd = endDate || 'end'

    link.href = url
    link.download = `hapgood-hours-${safeStart}-to-${safeEnd}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function exportPayrollTxt() {
    if (!displayedManagerEmployees.length) {
      setErrorMessage(
        'No employee totals are available to export for this date range.',
      )
      return
    }

    const safeStart = appliedStartDate || 'start'
    const safeEnd = appliedEndDate || 'end'
    const generatedAt = formatDateTime(new Date())

    const lines = [
      'HAPGOOD HOURS REPORT',
      `Date range: ${safeStart} to ${safeEnd}`,
      `Generated: ${generatedAt}`,
      '',
      `Recorded team hours (pending requests excluded): ${formatSeconds(totalTeamSeconds)}`,
      `Pending adjustment (not approved): ${formatSignedSeconds(pendingAdjustmentSeconds)}`,
      `Provisional team hours (includes pending): ${formatSeconds(provisionalTeamSeconds)}`,
      `Currently clocked in: ${currentlyClockedInCount}`,
      '',
      '========================================',
      '',
    ]

    displayedManagerEmployees.forEach((employee) => {
      const employeeShifts = managerShifts
        .filter((shift) => shift.employee_id === employee.employee_id)
        .sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in))

      const pending = pendingForEmployee(employee.employee_id)
      const pendingAdjustment = pending.reduce((sum, request) => sum + requestAdjustmentSeconds(request), 0)
      const totalIncludingPending = Number(employee.total_seconds ?? 0) + pendingAdjustment

      lines.push(employee.employee_name)
      lines.push(`Recorded: ${formatSeconds(employee.total_seconds)}`)
      lines.push(`Pending adjustment: ${formatSignedSeconds(pendingAdjustment)}`)
      lines.push(`Total including pending (unverified): ${formatSeconds(totalIncludingPending)}`)
      lines.push(`Pending requests: ${pending.length}`)
      lines.push(
        `Shifts: ${employee.shift_count} ${
          Number(employee.shift_count) === 1 ? 'shift' : 'shifts'
        }`,
      )

      if (employee.currently_clocked_in) {
        lines.push('Status: Currently clocked in')
      }

      lines.push('')

      if (employeeShifts.length === 0) {
        lines.push('  No shifts in this date range.')
      } else {
        employeeShifts.forEach((shift) => {
          const date = new Date(shift.clock_in).toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          const start = formatTime(shift.clock_in)
          const end = shift.clock_out ? formatTime(shift.clock_out) : 'Now'
          const duration = calculateDuration(shift.clock_in, shift.clock_out)

          lines.push(`  - ${date}`)
          lines.push(`    ${start} – ${end}`)
          lines.push(`    Duration: ${duration}`)

          if (!shift.clock_out) {
            lines.push('    Status: Active')
          }

          if (shift.edited_at) {
            lines.push(`    Edited: Yes`)
            lines.push(
              `    Edit reason: ${shift.edit_reason || 'Not provided'}`,
            )
          }

          lines.push('')
        })
      }

      lines.push('----------------------------------------')
      lines.push('')
    })

    const report = lines.join('\n')
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `hapgood-hours-${safeStart}-to-${safeEnd}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function selectCurrentWeek() {
    const beginning = getStartOfWeek(new Date())
    const nextStartDate = formatDateForInput(beginning)
    const nextEndDate = formatDateForInput(addDays(beginning, 6))

    setStartDate(nextStartDate)
    setEndDate(nextEndDate)

    await refreshManagerDashboard(
      loggedInEmployee?.id,
      pin,
      nextStartDate,
      nextEndDate,
    )
  }

  async function selectPreviousWeek() {
    const displayedWeekBeginning = startDate
      ? new Date(`${startDate}T00:00:00`)
      : getStartOfWeek(new Date())

    const previousWeekBeginning = addDays(displayedWeekBeginning, -7)
    const nextStartDate = formatDateForInput(previousWeekBeginning)
    const nextEndDate = formatDateForInput(addDays(previousWeekBeginning, 6))

    setStartDate(nextStartDate)
    setEndDate(nextEndDate)

    await refreshManagerDashboard(
      loggedInEmployee?.id,
      pin,
      nextStartDate,
      nextEndDate,
    )
  }

  // Build the display from recorded shifts + pending *adjustments*.
  // Corrections replace the old duration, rather than adding the entire requested shift.
  const rangeStartMs = new Date(`${appliedStartDate}T00:00:00`).getTime()
  const rangeEndMs = addDays(new Date(`${appliedEndDate}T00:00:00`), 1).getTime()

  function requestTouchesCurrentRange(request) {
    return (
      clippedShiftSeconds(request.requested_clock_in, request.requested_clock_out, rangeStartMs, rangeEndMs) > 0 ||
      (request.request_type === 'correction' &&
        clippedShiftSeconds(request.original_clock_in, request.original_clock_out, rangeStartMs, rangeEndMs) > 0)
    )
  }

  function requestAdjustmentSeconds(request) {
    const proposed = clippedShiftSeconds(
      request.requested_clock_in, request.requested_clock_out, rangeStartMs, rangeEndMs,
    )
    const recorded = request.request_type === 'correction'
      ? clippedShiftSeconds(request.original_clock_in, request.original_clock_out, rangeStartMs, rangeEndMs)
      : 0
    return proposed - recorded
  }

  function pendingForEmployee(employeeId) {
    return pendingCorrections.filter((request) => request.employee_id === employeeId)
  }

  function formatSignedSeconds(seconds) {
    if (Math.abs(seconds) < 60) return '0h 0m'
    return `${seconds >= 0 ? '+' : '−'}${formatSeconds(Math.abs(seconds))}`
  }

  const displayedManagerEmployees = [...managerTotals]
  const knownEmployeeIds = new Set(managerTotals.map((item) => item.employee_id))
  for (const employee of clockableEmployees) {
    if (knownEmployeeIds.has(employee.id)) continue
    knownEmployeeIds.add(employee.id)
    displayedManagerEmployees.push({
      employee_id: employee.id,
      employee_name: employee.name,
      total_seconds: 0,
      shift_count: 0,
      currently_clocked_in: false,
    })
  }
  for (const event of pendingOfflinePunches) {
    if (knownEmployeeIds.has(event.employee_id)) continue
    knownEmployeeIds.add(event.employee_id)
    displayedManagerEmployees.push({
      employee_id: event.employee_id,
      employee_name: event.employee_name,
      total_seconds: 0,
      shift_count: 0,
      currently_clocked_in: false,
    })
  }
  for (const request of pendingCorrections) {
    if (knownEmployeeIds.has(request.employee_id)) continue
    knownEmployeeIds.add(request.employee_id)
    displayedManagerEmployees.push({
      employee_id: request.employee_id,
      employee_name: request.employee_name,
      total_seconds: 0,
      shift_count: 0,
      currently_clocked_in: false,
    })
  }
  displayedManagerEmployees.sort((a, b) => {
    const aPending = pendingForEmployee(a.employee_id).length + offlineForEmployee(a.employee_id).length
    const bPending = pendingForEmployee(b.employee_id).length + offlineForEmployee(b.employee_id).length
    return bPending - aPending || a.employee_name.localeCompare(b.employee_name)
  })

  const pendingAdjustmentSeconds = pendingCorrections.reduce(
    (total, request) => total + requestAdjustmentSeconds(request), 0,
  )

  const totalTeamSeconds = managerTotals.reduce(
    (total, employee) => total + Number(employee.total_seconds ?? 0),
    0,
  )

  const provisionalTeamSeconds = totalTeamSeconds + pendingAdjustmentSeconds

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
          {connectionUnavailable && (
            <ConnectionNotice
              t={loginT}
              showRosterDetails={!isManagerRoute}
              usingCachedRoster={!isManagerRoute && usingCachedRoster}
              rosterSavedAt={rosterSavedAt}
              onRetry={() => void loadEmployees()}
              loading={loading}
            />
          )}
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

          {/* In-scope navigation keeps IndexedDB offline punches in this installed PWA. */}
          <nav className='mb-4 flex justify-end'>
            <a
              href={isManagerRoute ? '/' : '/manager'}
              className='rounded-lg px-3 py-2 text-sm font-semibold text-[#42523d] underline underline-offset-4 hover:text-[#2f352b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#42523d]'
            >
              {isManagerRoute ? '← Employee time clock' : loginT.managerDashboard + ' →'}
            </a>
          </nav>

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
                <p className='mb-2 block text-sm font-semibold text-stone-700'>
                  {loginT.pin}
                </p>

                <div
                  className='mb-4 flex justify-center gap-3 rounded-xl border border-stone-300 bg-stone-50 px-4 py-4'
                  aria-label='PIN entry'
                >
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={`h-4 w-4 rounded-full ${
                        pin.length > index ? 'bg-[#2f352b]' : 'bg-stone-300'
                      }`}
                    />
                  ))}
                </div>

                <div className='mx-auto grid max-w-xs grid-cols-3 gap-4'>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                    <button
                      key={digit}
                      type='button'
                      onClick={() => addPinDigit(String(digit))}
                      disabled={connectionUnavailable || submitting || pin.length >= 4}
                      className='mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-stone-300 bg-white text-2xl font-semibold text-stone-900 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
                    >
                      {digit}
                    </button>
                  ))}

                  <button
                    type='button'
                    onClick={clearPin}
                    disabled={submitting || pin.length === 0}
                    className='mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    Clear
                  </button>

                  <button
                    type='button'
                    onClick={() => addPinDigit('0')}
                    disabled={connectionUnavailable || submitting || pin.length >= 4}
                    className='mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-stone-300 bg-white text-2xl font-semibold text-stone-900 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    0
                  </button>

                  <button
                    type='button'
                    onClick={removePinDigit}
                    disabled={submitting || pin.length === 0}
                    className='mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
                    aria-label='Delete last PIN digit'
                  >
                    Delete
                  </button>
                </div>
              </div>

              {submitting && (
                <p className='text-center text-sm font-semibold text-stone-600'>
                  {loginT.checking}
                </p>
              )}
            </div>

            {errorMessage && (
              <p className='mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
                {errorMessage}
              </p>
            )}
          </form>

          {!isManagerRoute && connectionUnavailable && employees.length > 0 && (
            <section className='mt-5 rounded-2xl border border-amber-300 bg-white p-5 shadow-sm'>
              <h2 className='font-bold text-stone-900'>{t.offlinePunchHeading}</h2>
              <p className='mt-2 text-sm leading-6 text-stone-700'>{t.offlinePunchExplainer}</p>
              <p className='mt-3 text-xs text-stone-600'>
                {t.employee}: <strong>{employees.find((item) => item.id === selectedEmployeeId)?.name || '—'}</strong>
              </p>
              <div className='mt-4 grid gap-2 sm:grid-cols-2'>
                <button type='button' onClick={() => void saveOfflineEvent('in')}
                  disabled={offlineBusy || !selectedEmployeeId}
                  className='rounded-xl bg-[#2f352b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50'>
                  {t.offlineClockIn}
                </button>
                <button type='button' onClick={() => void saveOfflineEvent('out')}
                  disabled={offlineBusy || !selectedEmployeeId}
                  className='rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-800 disabled:opacity-50'>
                  {t.offlineClockOut}
                </button>
              </div>
              <p className='mt-3 text-sm font-semibold text-amber-900'>
                {t.offlineQueued}: {offlineQueue.length}
              </p>
              {offlineNotice && <p role='status' className='mt-3 rounded-xl bg-amber-50 p-3 text-sm text-stone-900'>{offlineNotice}</p>}
            </section>
          )}

          {!isManagerRoute && !connectionUnavailable && offlineQueue.length > 0 && (
            <p className='mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
              {t.offlineQueued}: {offlineQueue.length}. {t.offlineSaved}
            </p>
          )}
        </div>
      </main>
    )
  }

  if (isManagerRoute && loggedInEmployee.role === 'manager') {
    return (
      <main className='min-h-screen bg-[#f4f0e7] px-4 py-6 text-stone-800 sm:px-6 sm:py-10'>
        <div className='mx-auto max-w-4xl'>
          {connectionUnavailable && (
            <ConnectionNotice
              t={loginT}
              showRosterDetails={false}
              usingCachedRoster={false}
              rosterSavedAt={null}
              onRetry={() => void loadEmployees()}
              loading={loading}
            />
          )}
          {successMessage && (
            <div className='fixed top-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm font-semibold text-emerald-800 shadow-lg'>
              {successMessage}
            </div>
          )}

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
                  End date (dates are inclusive)
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

            <div className='mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap'>
              <button
                type='button'
                onClick={() => refreshManagerDashboard()}
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
                Current Week
              </button>

              <button
                type='button'
                onClick={selectPreviousWeek}
                disabled={loading}
                className='rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50'
              >
                Previous Week
              </button>

              <button
                type='button'
                onClick={() => openManagerAddShiftForm()}
                disabled={loading || submitting || clockableEmployees.length === 0}
                className='rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50'
              >
                Add Shift
              </button>

              <button
                type='button'
                onClick={exportPayrollTxt}
                disabled={loading || managerTotals.length === 0}
                className='rounded-xl bg-[#d8c6a2] px-5 py-3 text-sm font-semibold text-[#2f352b] transition hover:bg-[#e2d1ae] disabled:cursor-not-allowed disabled:opacity-50'
              >
                Download Report
              </button>
            </div>
          </section>

          {errorMessage && (
            <p className='mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
              {errorMessage}
            </p>
          )}

          {pendingLoadFailed && (
            <p className='mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800'>
              Pending requests could not be loaded. Totals shown here are incomplete until you refresh successfully.
            </p>
          )}

          {(offlineQueue.length > 0 || pendingOfflinePunches.length > 0 || offlineReviewLoadFailed) && (
            <section className='mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5'>
              <h2 className='font-semibold text-stone-900'>Offline punches · unverified</h2>
              <p className='mt-1 text-sm text-stone-700'>
                {offlineQueue.length} saved on this device awaiting manager sync · {pendingOfflinePunches.length} on the server awaiting review.
                Offline timestamps are not verified and do not count toward recorded or provisional payroll until approved.
              </p>
              {offlineQueue.length > 0 && (
                <button type='button' onClick={() => void syncOfflineQueue()}
                  disabled={offlineBusy || connectionUnavailable}
                  className='mt-3 rounded-xl bg-[#2f352b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'>
                  {offlineBusy ? 'Syncing...' : `Sync ${offlineQueue.length} saved punches for review`}
                </button>
              )}
              {offlineReviewLoadFailed && (
                <p className='mt-3 font-semibold text-red-700'>Could not load offline punches. Do not treat this review list as complete.</p>
              )}
            </section>
          )}

          <section className='mb-6 grid gap-4 sm:grid-cols-3'>
            <article className='rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_16px_50px_rgba(67,62,51,0.08)]'>
              <p className='text-sm font-medium text-stone-500'>
                Total hours · including pending
              </p>
              <p className='mt-2 text-3xl font-semibold text-stone-900'>
                {formatSeconds(provisionalTeamSeconds)}
              </p>
              <p className='mt-2 text-xs text-stone-500'>
                Recorded: {formatSeconds(totalTeamSeconds)}
              </p>
            </article>

            <article className='rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-[0_16px_50px_rgba(67,62,51,0.08)]'>
              <p className='text-sm font-medium text-amber-800'>
                Pending hours adjustment
              </p>
              <p className='mt-2 text-3xl font-semibold text-amber-900'>
                {formatSignedSeconds(pendingAdjustmentSeconds)}
              </p>
              <p className='mt-2 text-xs text-amber-800'>
                {pendingCorrections.length} {pendingCorrections.length === 1 ? 'request' : 'requests'} awaiting review
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

          <section className='rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
            <div className='mb-5 flex items-center justify-between gap-4'>
              <div>
                <h2 className='text-xl font-semibold text-stone-900'>
                  Employee Totals
                </h2>
                <p className='mt-1 text-sm text-stone-500'>
                  Recorded and provisional hours from{' '}
                  {new Date(`${appliedStartDate}T00:00:00`).toLocaleDateString()}
                  {' through '}
                  {new Date(`${appliedEndDate}T00:00:00`).toLocaleDateString()}
                </p>
              </div>

              <button
                type='button'
                onClick={() => refreshManagerDashboard()}
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
            ) : displayedManagerEmployees.length === 0 ? (
              <div className='rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center'>
                <p className='font-medium text-stone-700'>No employees found</p>
              </div>
            ) : (
              <div className='space-y-3'>
                {displayedManagerEmployees.map((employee) => {
                  const isExpanded = expandedEmployeeId === employee.employee_id
                  const employeeShifts = getManagerShiftsForEmployee(
                    employee.employee_id,
                  )
                  const employeePending = pendingForEmployee(employee.employee_id)
                  const employeeOffline = offlineForEmployee(employee.employee_id)
                  const employeeAdjustmentSeconds = employeePending.reduce(
                    (total, request) => total + requestAdjustmentSeconds(request), 0,
                  )
                  const employeeTotalIncludingPending = Number(employee.total_seconds ?? 0) + employeeAdjustmentSeconds

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
                            {employeePending.length > 0 && (
                              <span className='rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800'>
                                ⚠ {employeePending.length} pending {employeePending.length === 1 ? 'request' : 'requests'}
                              </span>
                            )}
                            {employeeOffline.length > 0 && (
                              <span className='rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800'>
                                {employeeOffline.length} unverified offline punches
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
                          <div className='sm:text-right'>
                            <p className='text-xs font-semibold text-stone-500'>
                              Total including pending
                            </p>
                            <p className='text-2xl font-semibold text-stone-900'>
                              {formatSeconds(employeeTotalIncludingPending)}
                            </p>
                            {employeePending.length > 0 && (
                              <p className='mt-1 text-xs font-semibold text-amber-800'>
                                Recorded {formatSeconds(employee.total_seconds)} · Pending {formatSignedSeconds(employeeAdjustmentSeconds)}
                              </p>
                            )}
                          </div>
                          <span className='text-lg text-stone-400'>
                            {isExpanded ? '−' : '+'}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className='border-t border-stone-200 bg-white px-4 py-4'>
                          {employeePending.length > 0 && (
                            <section className='mb-5 space-y-3' aria-label='Pending shift requests'>
                              <h4 className='font-semibold text-amber-900'>
                                Corrections to review ({employeePending.length})
                              </h4>
                              {employeePending.map((request) => (
                                <article key={request.request_id} className='rounded-xl border border-amber-200 bg-amber-50 p-4'>
                                  <div className='flex flex-wrap items-center justify-between gap-2'>
                                    <p className='font-semibold text-stone-900'>
                                      {request.request_type === 'missing_shift' ? 'Missed shift' : 'Shift correction'} · {formatDate(request.requested_clock_in)}
                                    </p>
                                    <span className='rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900'>
                                      Needs approval
                                    </span>
                                  </div>
                                  {!requestTouchesCurrentRange(request) && (
                                    <p className='mt-2 text-xs font-semibold text-amber-900'>
                                      Outside selected report dates · not included in the hours above
                                    </p>
                                  )}
                                  {request.request_type === 'correction' && (
                                    <p className='mt-2 text-sm text-stone-600'>
                                      Recorded: {formatDateTime(request.original_clock_in)} – {request.original_clock_out ? formatDateTime(request.original_clock_out) : 'Still open'}
                                    </p>
                                  )}
                                  <p className='mt-2 text-sm font-semibold text-stone-900'>
                                    Requested: {formatDateTime(request.requested_clock_in)} – {formatDateTime(request.requested_clock_out)}
                                  </p>
                                  {requestTouchesCurrentRange(request) && (
                                    <p className='mt-1 text-xs font-semibold text-amber-900'>
                                      Pending adjustment for this report: {formatSignedSeconds(requestAdjustmentSeconds(request))}
                                    </p>
                                  )}
                                  <p className='mt-2 text-sm text-stone-700'>
                                    Employee reason: {request.reason}
                                  </p>
                                  <label htmlFor={`manager-note-${request.request_id}`} className='mt-3 block text-xs font-semibold text-stone-600'>
                                    Manager note (optional)
                                  </label>
                                  <textarea
                                    id={`manager-note-${request.request_id}`}
                                    rows={2}
                                    value={activeManagerNoteId === request.request_id ? managerNote : ''}
                                    onFocus={() => {
                                      if (activeManagerNoteId !== request.request_id) {
                                        setActiveManagerNoteId(request.request_id)
                                        setManagerNote('')
                                      }
                                    }}
                                    onChange={(event) => {
                                      setActiveManagerNoteId(request.request_id)
                                      setManagerNote(event.target.value)
                                    }}
                                    placeholder='Optional note for approval or rejection'
                                    className='mt-1 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm'
                                  />
                                  <div className='mt-3 flex flex-wrap gap-2'>
                                    <button type='button' onClick={() => reviewCorrection(request.request_id, 'approved')}
                                      disabled={reviewingRequestId !== null || submitting}
                                      className='rounded-lg bg-[#2f352b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'>
                                      {reviewingRequestId === request.request_id ? 'Saving...' : 'Approve'}
                                    </button>
                                    <button type='button' onClick={() => openPendingRequestEditor(request)}
                                      disabled={reviewingRequestId !== null || submitting}
                                      className='rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 disabled:opacity-50'>
                                      Edit & Approve
                                    </button>
                                    <button type='button' onClick={() => reviewCorrection(request.request_id, 'rejected')}
                                      disabled={reviewingRequestId !== null || submitting}
                                      className='rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50'>
                                      Reject
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          )}

                          {employeeOffline.length > 0 && (
                            <section className='mb-5 space-y-3' aria-label='Unverified offline punches'>
                              <h4 className='font-semibold text-orange-900'>Offline punches to review ({employeeOffline.length})</h4>
                              <p className='text-sm text-stone-600'>Client device clock was not verified. Match a clock-in to its clock-out, check times, and enter a reason before approval. These hours are not in payroll yet.</p>
                              {employeeOffline.map((event) => {
                                const matchingOuts = event.event_type === 'in'
                                  ? employeeOffline.filter((candidate) =>
                                    candidate.event_type === 'out' &&
                                    new Date(candidate.occurred_at) > new Date(event.occurred_at) &&
                                    new Date(candidate.occurred_at) - new Date(event.occurred_at) <= 86400000
                                  ) : []
                                return (
                                  <div key={event.id} className='rounded-xl border border-orange-200 bg-orange-50 p-4'>
                                    <p className='text-sm font-semibold text-stone-900'>
                                      {event.event_type === 'in' ? 'Clock IN' : 'Clock OUT'} · {formatDateTime(event.occurred_at)}
                                    </p>
                                    <p className='mt-1 text-xs text-orange-900'>Unverified · received {formatDateTime(event.received_at)}</p>
                                    {event.event_type === 'in' && (
                                      <label className='mt-3 block text-sm font-semibold text-stone-700'>
                                        Matching clock-out
                                        <select value={offlineOutSelections[event.id] || ''}
                                          onChange={(e) => setOfflineOutSelections((old) => ({ ...old, [event.id]: e.target.value }))}
                                          className='mt-1 block w-full rounded-lg border border-stone-300 bg-white p-2 text-sm'>
                                          <option value=''>Choose clock-out punch</option>
                                          {matchingOuts.map((candidate) => (
                                            <option key={candidate.id} value={candidate.id}>{formatDateTime(candidate.occurred_at)}</option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                    <label className='mt-3 block text-sm font-semibold text-stone-700'>
                                      Manager review reason (required)
                                      <input type='text' value={offlineNotes[event.id] || ''}
                                        onChange={(e) => setOfflineNotes((old) => ({ ...old, [event.id]: e.target.value }))}
                                        placeholder='e.g. Confirmed against schedule'
                                        className='mt-1 block w-full rounded-lg border border-stone-300 bg-white p-2 text-sm'/>
                                    </label>
                                    <div className='mt-3 flex flex-wrap gap-2'>
                                      {event.event_type === 'in' && (
                                        <button type='button'
                                          disabled={offlineReviewBusyId !== null || connectionUnavailable || !offlineOutSelections[event.id]}
                                          onClick={() => void approveOfflinePair(event, offlineOutSelections[event.id])}
                                          className='rounded-lg bg-[#2f352b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50'>
                                          Approve matched shift
                                        </button>
                                      )}
                                      <button type='button' disabled={offlineReviewBusyId !== null || connectionUnavailable}
                                        onClick={() => void rejectOfflinePunch(event.id)}
                                        className='rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50'>
                                        Reject this punch
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </section>
                          )}

                          <div className='mb-3 flex justify-end'>
                            <button
                              type='button'
                              onClick={() =>
                                openManagerAddShiftForm(employee.employee_id)
                              }
                              disabled={submitting}
                              className='rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
                            >
                              Add Shift
                            </button>
                          </div>

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

                                    <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
                                      <button
                                        type='button'
                                        onClick={() =>
                                          openManagerEditShiftForm(shift)
                                        }
                                        disabled={submitting || employeePending.some((request) => request.time_entry_id === shift.entry_id)}
                                        title={employeePending.some((request) => request.time_entry_id === shift.entry_id) ? 'Review the pending correction above instead' : 'Edit this recorded shift'}
                                        className='rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
                                      >
                                        Edit
                                      </button>

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

          {pendingEditRequest && (
            <div className='fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 px-4 py-6 sm:items-center'>
              <div className='max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8'>
                <h2 className='text-xl font-semibold text-stone-900'>Edit & Approve Request</h2>
                <p className='mt-2 text-sm text-stone-600'>
                  {pendingEditRequest.employee_name} · Submitted {formatDateTime(pendingEditRequest.created_at)}
                </p>
                <p className='mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900'>
                  Original employee request: {formatDateTime(pendingEditRequest.requested_clock_in)} – {formatDateTime(pendingEditRequest.requested_clock_out)}
                </p>
                {errorMessage && (
                  <p className='mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800'>
                    {errorMessage}
                  </p>
                )}
                <form onSubmit={submitEditedPendingRequest} className='mt-5 space-y-4'>
                  <div>
                    <label htmlFor='pending-edit-clock-in' className='mb-1 block text-sm font-semibold'>Approved clock-in</label>
                    <input id='pending-edit-clock-in' type='datetime-local' required value={pendingEditClockIn}
                      onChange={(event) => setPendingEditClockIn(event.target.value)}
                      className='w-full rounded-xl border border-stone-300 px-3 py-3' />
                  </div>
                  <div>
                    <label htmlFor='pending-edit-clock-out' className='mb-1 block text-sm font-semibold'>Approved clock-out</label>
                    <input id='pending-edit-clock-out' type='datetime-local' required value={pendingEditClockOut}
                      onChange={(event) => setPendingEditClockOut(event.target.value)}
                      className='w-full rounded-xl border border-stone-300 px-3 py-3' />
                  </div>
                  <div>
                    <label htmlFor='pending-edit-reason' className='mb-1 block text-sm font-semibold'>Manager reason (required)</label>
                    <textarea id='pending-edit-reason' value={pendingEditReason} required rows={3}
                      onChange={(event) => setPendingEditReason(event.target.value)}
                      placeholder='Why are you changing the requested times?'
                      className='w-full rounded-xl border border-stone-300 px-3 py-3' />
                  </div>
                  <p className='text-xs text-stone-500'>Saving approves these times and preserves the originally submitted times in the request edit history.</p>
                  <div className='flex flex-wrap gap-3'>
                    <button type='submit' disabled={submitting}
                      className='rounded-xl bg-[#2f352b] px-5 py-3 font-semibold text-white disabled:opacity-50'>
                      {submitting ? 'Saving...' : 'Save & Approve'}
                    </button>
                    <button type='button' onClick={closePendingRequestEditor} disabled={submitting}
                      className='rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-700 disabled:opacity-50'>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {isManagerShiftFormOpen && (
            <div className='fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 px-4 py-6 sm:items-center'>
              <div className='max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8'>
                <div className='mb-5 flex items-start justify-between gap-4'>
                  <div>
                    <p className='text-xs font-semibold tracking-[0.22em] text-[#6f735f] uppercase'>
                      Manager Edit
                    </p>
                    <h2 className='mt-1 text-2xl font-semibold text-stone-900'>
                      {managerShiftFormMode === 'add'
                        ? 'Add Shift'
                        : 'Edit Shift'}
                    </h2>
                    <p className='mt-2 text-sm leading-6 text-stone-500'>
                      Enter the correct times and a short reason. The audit log
                      will save this change automatically.
                    </p>
                  </div>

                  <button
                    type='button'
                    onClick={closeManagerShiftForm}
                    disabled={submitting}
                    className='rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
                  >
                    Close
                  </button>
                </div>

                <form className='space-y-4' onSubmit={submitManagerShiftForm}>
                  <div>
                    <label
                      htmlFor='manager-shift-employee'
                      className='mb-2 block text-sm font-semibold text-stone-700'
                    >
                      Employee
                    </label>

                    <select
                      id='manager-shift-employee'
                      value={managerShiftEmployeeId}
                      onChange={(event) =>
                        setManagerShiftEmployeeId(event.target.value)
                      }
                      disabled={submitting || managerShiftFormMode === 'edit'}
                      className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15 disabled:cursor-not-allowed disabled:opacity-60'
                    >
                      {clockableEmployees.length === 0 && (
                        <option value=''>No employees loaded</option>
                      )}

                      {clockableEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className='grid gap-4 sm:grid-cols-2'>
                    <div>
                      <label
                        htmlFor='manager-shift-clock-in'
                        className='mb-2 block text-sm font-semibold text-stone-700'
                      >
                        Clock in
                      </label>

                      <input
                        id='manager-shift-clock-in'
                        type='datetime-local'
                        value={managerShiftClockIn}
                        onChange={(event) =>
                          setManagerShiftClockIn(event.target.value)
                        }
                        disabled={submitting}
                        className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15 disabled:cursor-not-allowed disabled:opacity-60'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor='manager-shift-clock-out'
                        className='mb-2 block text-sm font-semibold text-stone-700'
                      >
                        Clock out
                      </label>

                      <input
                        id='manager-shift-clock-out'
                        type='datetime-local'
                        value={managerShiftClockOut}
                        onChange={(event) =>
                          setManagerShiftClockOut(event.target.value)
                        }
                        disabled={submitting}
                        className='w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15 disabled:cursor-not-allowed disabled:opacity-60'
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor='manager-shift-reason'
                      className='mb-2 block text-sm font-semibold text-stone-700'
                    >
                      Reason
                    </label>

                    <textarea
                      id='manager-shift-reason'
                      rows='3'
                      value={managerShiftReason}
                      onChange={(event) =>
                        setManagerShiftReason(event.target.value)
                      }
                      placeholder='Example: Employee forgot to clock out.'
                      disabled={submitting}
                      className='w-full resize-none rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-[#68785b] focus:ring-4 focus:ring-[#68785b]/15 disabled:cursor-not-allowed disabled:opacity-60'
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
                    {submitting
                      ? 'Saving...'
                      : managerShiftFormMode === 'add'
                        ? 'Add Shift'
                        : 'Save Changes'}
                  </button>
                </form>
              </div>
            </div>
          )}

          <footer className='py-6 text-center text-xs text-stone-500'>
            <a href='/' className='font-semibold text-[#42523d] underline underline-offset-4'>
              ← Employee time clock
            </a>
            <p className='mt-2'>Hapgood Management Dashboard</p>
          </footer>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen bg-[#f4f0e7] px-4 py-6 text-stone-800 sm:px-6 sm:py-10'>
      <div className='mx-auto max-w-2xl'>
        {connectionUnavailable && (
          <ConnectionNotice
            t={t}
            showRosterDetails={false}
            usingCachedRoster={usingCachedRoster}
            rosterSavedAt={rosterSavedAt}
            onRetry={() => void loadEmployees()}
            loading={loading}
          />
        )}
        {successMessage && (
          <div className='fixed top-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm font-semibold text-emerald-800 shadow-lg'>
            {successMessage}
          </div>
        )}

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
              {formatTwelveHourTime(currentTime)}
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
              disabled={connectionUnavailable || submitting}
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
              disabled={connectionUnavailable || submitting}
              className='rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
            >
              {t.reportMissedShift}
            </button>
          </div>
        </section>

        <section className='rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_16px_50px_rgba(67,62,51,0.08)] sm:p-7'>
          <div className='mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h2 className='text-lg font-semibold text-stone-900'>
                {t.recentShifts}
              </h2>
              <p className='mt-1 text-sm leading-6 text-stone-500'>
                {hideRecentShifts
                  ? t.recentShiftsHidden
                  : t.recentShiftsPreview}
              </p>
            </div>

            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <button
                type='button'
                onClick={() => {
                  setHideRecentShifts((current) => !current)
                  setShowAllRecentShifts(false)
                }}
                disabled={loading || submitting}
                className='rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
              >
                {hideRecentShifts ? t.showRecentShifts : t.hideRecentShifts}
              </button>

              {!hideRecentShifts && (
                <button
                  type='button'
                  onClick={() =>
                    Promise.all([
                      loadEntries(),
                      loadEmployeeCorrectionRequests(),
                    ])
                  }
                  disabled={loading || submitting}
                  className='rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
                >
                  {t.refresh}
                </button>
              )}
            </div>
          </div>

          {hideRecentShifts ? (
            <div className='rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center'>
              <p className='text-sm font-medium text-stone-600'>
                {t.recentShiftsHidden}
              </p>
            </div>
          ) : loading ? (
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
            <>
              <div className='divide-y divide-stone-200'>
                {displayedEntries.map((entry) => {
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
                          {entry.clock_out
                            ? formatTime(entry.clock_out)
                            : 'Now'}
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

                        {entry.clock_out && (
                          <>
                            {correction && (
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
                            )}

                            {correction?.status !== 'pending' && (
                              <button
                                type='button'
                                onClick={() => openCorrectionForm(entry)}
                                disabled={connectionUnavailable}
                                className='rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100'
                              >
                                {t.requestCorrection}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>

              {hasMoreRecentShifts && (
                <div className='mt-4 rounded-xl bg-stone-50 px-4 py-3 text-center'>
                  <p className='mb-3 text-sm text-stone-500'>
                    {showAllRecentShifts
                      ? `Showing all ${entries.length} shifts.`
                      : `Showing 3 of ${entries.length} recent shifts.`}
                  </p>

                  <button
                    type='button'
                    onClick={toggleShowAllRecentShifts}
                    disabled={loading || submitting || loadingAllShifts}
                    className='rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50'
                  >
                    {loadingAllShifts
                      ? t.loadingAllShifts
                      : showAllRecentShifts
                        ? t.showLessShifts
                        : t.showAllShifts}
                  </button>
                </div>
              )}
            </>
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
                  {t.reason} <span className='text-red-700' aria-hidden='true'>*</span>
                </label>

                <textarea
                  id='correction-reason'
                  rows='4'
                  value={correctionReason}
                  onChange={(event) => {
                    const nextReason = event.target.value
                    setCorrectionReason(nextReason)
                    if (nextReason.trim().length >= 3) {
                      setShowReasonWarning(false)
                    }
                  }}
                  placeholder={t.reasonPlaceholder}
                  aria-required='true'
                  aria-invalid={showReasonWarning}
                  aria-describedby={showReasonWarning ? 'correction-reason-hint' : undefined}
                  className={`w-full resize-none rounded-xl border bg-stone-50 px-4 py-3 text-stone-900 outline-none focus:ring-4 ${
                    showReasonWarning
                      ? 'border-red-500 focus:border-red-600 focus:ring-red-500/15'
                      : 'border-stone-300 focus:border-[#68785b] focus:ring-[#68785b]/15'
                  }`}
                />
                {showReasonWarning && (
                  <p id='correction-reason-hint' role='alert' className='mt-2 text-sm font-medium text-red-700'>
                    {t.reasonTooShort}
                  </p>
                )}
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
