import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config';
import { WasteItem } from '../types/waste';
import { StoreSettings, DEFAULT_STORE_SETTINGS } from '../utils/storage';

const WASTE_ITEMS_PATH = 'waste_items';
const STORE_SETTINGS_PATH = 'store_settings';
const SETTINGS_DOC_ID = 'current';

/**
 * Real-time listener for waste items
 * Automatically updates both mobile and PC whenever data changes
 */
export function subscribeToWasteItems(
  onUpdate: (items: WasteItem[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const colRef = collection(db, WASTE_ITEMS_PATH);
  // Sort by date descending and registeredAt descending
  const q = query(colRef, orderBy('date', 'desc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: WasteItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          ...(data as WasteItem),
          id: docSnap.id,
        });
      });
      onUpdate(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, WASTE_ITEMS_PATH);
    }
  );

  return unsubscribe;
}

/**
 * Add a new waste item to Firestore
 */
export async function addWasteItemToFirestore(
  item: Omit<WasteItem, 'id' | 'registeredAt'> & { id?: string; registeredAt?: string }
): Promise<WasteItem> {
  const itemId = item.id || `waste-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const registeredAt = item.registeredAt || new Date().toISOString();

  const docData: WasteItem = {
    ...item,
    id: itemId,
    registeredAt,
    quantity: Number(item.quantity) || 1,
  };

  // Remove undefined fields to prevent Firestore serialization errors
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(docData)) {
    if (value !== undefined) {
      cleanData[key] = value;
    }
  }

  const docRef = doc(db, WASTE_ITEMS_PATH, itemId);
  try {
    await setDoc(docRef, cleanData);
    return docData;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${WASTE_ITEMS_PATH}/${itemId}`);
  }
}

/**
 * Update quantity or fields of an existing waste item
 */
export async function updateWasteItemInFirestore(
  id: string,
  updates: Partial<WasteItem>
): Promise<void> {
  const docRef = doc(db, WASTE_ITEMS_PATH, id);
  try {
    const cleanUpdates: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        cleanUpdates[k] = v;
      }
    }
    await updateDoc(docRef, cleanUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${WASTE_ITEMS_PATH}/${id}`);
  }
}

/**
 * Delete a waste item from Firestore
 */
export async function deleteWasteItemFromFirestore(id: string): Promise<void> {
  const docRef = doc(db, WASTE_ITEMS_PATH, id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${WASTE_ITEMS_PATH}/${id}`);
  }
}

/**
 * Real-time listener for store settings
 */
export function subscribeToStoreSettings(
  onUpdate: (settings: StoreSettings) => void,
  onError?: (error: unknown) => void
): () => void {
  const docRef = doc(db, STORE_SETTINGS_PATH, SETTINGS_DOC_ID);
  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as StoreSettings);
      } else {
        onUpdate(DEFAULT_STORE_SETTINGS);
      }
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, `${STORE_SETTINGS_PATH}/${SETTINGS_DOC_ID}`);
    }
  );

  return unsubscribe;
}

/**
 * Save store settings to Firestore
 */
export async function saveStoreSettingsToFirestore(settings: StoreSettings): Promise<void> {
  const docRef = doc(db, STORE_SETTINGS_PATH, SETTINGS_DOC_ID);
  try {
    await setDoc(docRef, settings, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${STORE_SETTINGS_PATH}/${SETTINGS_DOC_ID}`);
  }
}

/**
 * Check if Firestore has waste records, and seed initial records if empty
 */
export async function ensureInitialDataInFirestore(initialItems: WasteItem[]): Promise<boolean> {
  try {
    const colRef = collection(db, WASTE_ITEMS_PATH);
    const snap = await getDocs(colRef);
    if (snap.empty && initialItems.length > 0) {
      const batch = writeBatch(db);
      // Batch write seed data (up to 50 items)
      initialItems.slice(0, 40).forEach((item) => {
        const docRef = doc(db, WASTE_ITEMS_PATH, item.id);
        const cleanData: Record<string, any> = {};
        for (const [k, v] of Object.entries(item)) {
          if (v !== undefined) cleanData[k] = v;
        }
        batch.set(docRef, cleanData);
      });
      await batch.commit();
      return true;
    }
  } catch (error) {
    console.warn('Could not check or seed initial data in Firestore:', error);
  }
  return false;
}
