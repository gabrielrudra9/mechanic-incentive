import { writable } from 'svelte/store';

export interface QueueItem {
  id: string;
  submission: any;
  status: 'pending' | 'synced' | 'failed';
  timestamp: string;
  syncAttempts: number;
}

export const offlineQueue = writable<QueueItem[]>([]);

let db: IDBDatabase;

async function initOfflineDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('mechanic-incentive', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    };
  });
}

export async function addToOfflineQueue(submission: any) {
  if (!db) await initOfflineDB();
  const id = crypto.randomUUID();
  const item: QueueItem = {
    id,
    submission,
    status: 'pending',
    timestamp: new Date().toISOString(),
    syncAttempts: 0,
  };

  return new Promise<void>((resolve) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add(item);
    tx.oncomplete = () => {
      offlineQueue.update((queue) => [...queue, item]);
      resolve();
    };
  });
}

export async function syncOfflineQueue() {
  if (!db) await initOfflineDB();

  const pending = await new Promise<QueueItem[]>((resolve) => {
    const tx = db.transaction('queue', 'readonly');
    const request = tx.objectStore('queue').getAll();
    request.onsuccess = () => {
      resolve(
        (request.result as QueueItem[]).filter((item) => item.status === 'pending')
      );
    };
  });

  for (const item of pending) {
    try {
      const response = await fetch('http://localhost:3001/api/work-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Submission-ID': item.id,
        },
        body: JSON.stringify(item.submission),
      });

      const tx = db.transaction('queue', 'readwrite');
      if (response.ok) {
        item.status = 'synced';
      } else {
        item.syncAttempts++;
      }
      tx.objectStore('queue').put(item);
      offlineQueue.update((queue) =>
        queue.map((q) => (q.id === item.id ? item : q))
      );
    } catch (error) {
      item.syncAttempts++;
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').put(item);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', syncOfflineQueue);
}