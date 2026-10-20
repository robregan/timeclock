// ShiftClock offline event queue. Only public employee IDs/names, event type,
// device ID, and client-side timestamps are stored. Never store PINs or hashes.
// Browser storage is device-local, unverified and can be cleared by users.

const projectKey = new URL(import.meta.env.VITE_SUPABASE_URL).hostname
const DATABASE_NAME = `shiftclock-offline-v1:${projectKey}`

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support offline storage.'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('punches')) {
        db.createObjectStore('punches', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'))
    request.onblocked = () => reject(new Error('Offline storage is blocked by another app tab.'))
  })
}

async function withStore(name, mode, action) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    let result
    const transaction = db.transaction(name, mode)
    const store = transaction.objectStore(name)
    transaction.oncomplete = () => {
      db.close()
      resolve(result)
    }
    transaction.onerror = () => {
      const error = transaction.error || new Error('Offline storage failed.')
      db.close()
      reject(error)
    }
    transaction.onabort = () => {
      const error = transaction.error || new Error('Offline storage operation was cancelled.')
      db.close()
      reject(error)
    }
    try {
      action(store, (value) => { result = value })
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

async function getDeviceId() {
  return withStore('settings', 'readwrite', (store, setResult) => {
    const request = store.get('device-id')
    request.onsuccess = () => {
      const id = request.result?.value || crypto.randomUUID()
      if (!request.result) store.put({ key: 'device-id', value: id })
      setResult(id)
    }
  })
}

export async function recordOfflinePunch({ employeeId, employeeName, eventType }) {
  if (!['in', 'out'].includes(eventType) || !employeeId || !employeeName) {
    throw new Error('Choose an employee and a punch type.')
  }
  // Explicitly unverified: the local clock and selected name are not credentials.
  const punch = {
    id: crypto.randomUUID(),
    employee_id: employeeId,
    employee_name: employeeName,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    device_id: await getDeviceId(),
  }
  await withStore('punches', 'readwrite', (store) => {
    store.add(punch)
  })
  return punch
}

export async function listOfflinePunches() {
  const punches = await withStore('punches', 'readonly', (store, setResult) => {
    const request = store.getAll()
    request.onsuccess = () => setResult(request.result || [])
  })
  return punches.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
}

export async function removeSyncedPunch(eventId) {
  return withStore('punches', 'readwrite', (store) => store.delete(eventId))
}
