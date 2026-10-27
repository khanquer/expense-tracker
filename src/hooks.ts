import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Category } from './db'

/** All categories in display order (including archived, so old items still resolve). */
export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), [], [] as Category[])
}

export function useCategoryMap() {
  const categories = useCategories()
  return new Map(categories.map((c) => [c.id, c]))
}
