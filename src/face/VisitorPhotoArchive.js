const DATABASE_NAME = 'echo-visitor-photo-archive';
const DATABASE_VERSION = 2;
const STORE_NAME = 'captures';
const SCATTER_STORE_NAME = 'scatteredPhotos';

const openDatabase = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('IndexedDB is unavailable.'));
    return;
  }
  const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
    if (!database.objectStoreNames.contains(SCATTER_STORE_NAME)) {
      database.createObjectStore(SCATTER_STORE_NAME, { keyPath: 'world' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Photo archive could not be opened.'));
});

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Captured photo could not be encoded.'));
  }, 'image/png');
});

export async function archiveVisitorPhoto(canvas) {
  if (!canvas?.width || !canvas?.height) return null;
  const blob = await canvasToBlob(canvas);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).add({
      blob,
      capturedAt: Date.now(),
      width: canvas.width,
      height: canvas.height,
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Captured photo could not be archived.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function loadVisitorPhotos() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const captures = request.result.sort((a, b) => a.capturedAt - b.capturedAt);
      resolve(captures);
    };
    request.onerror = () => reject(request.error ?? new Error('Archived photos could not be loaded.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function loadScatteredPhotos(world) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SCATTER_STORE_NAME, 'readonly');
    const request = transaction.objectStore(SCATTER_STORE_NAME).get(world);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Scattered photos could not be loaded.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function saveScatteredPhotos(snapshot) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SCATTER_STORE_NAME, 'readwrite');
    transaction.objectStore(SCATTER_STORE_NAME).put(snapshot);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Scattered photos could not be saved.'));
    };
  });
}
