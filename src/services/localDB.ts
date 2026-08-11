export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShindexLocalDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('detailsCache')) {
        db.createObjectStore('detailsCache', { keyPath: 'path' });
      }
    };
  });
};

export const getLocalCache = async (path: string): Promise<any> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('detailsCache', 'readonly');
      const store = tx.objectStore('detailsCache');
      const req = store.get(path);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
};

export const setLocalCache = async (path: string, data: any): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('detailsCache', 'readwrite');
      const store = tx.objectStore('detailsCache');
      const req = store.put({ path, ...data, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error(e);
  }
};
