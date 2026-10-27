import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ExpenseForm } from '../components/ExpenseForm'
import { AppBar, ConfirmSheet, EmptyState, haptic, IconButton, toast } from '../components/ui'
import { deleteExpense, loadDraft, type Draft } from '../lib/draft'

export function EditExpense() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    loadDraft(id).then((d) => setDraft(d ?? null))
  }, [id])

  if (draft === null) {
    return (
      <div className="screen">
        <AppBar title="Expense" back />
        <EmptyState icon="history" title="This expense no longer exists" />
      </div>
    )
  }
  if (!draft) return null

  return (
    <>
      <ExpenseForm
        key={draft.id}
        initial={draft}
        title="Expense"
        summaryFirst
        saveFromSummary={false}
        actions={<IconButton icon="trash" label="Delete expense" tone="danger" onClick={() => setConfirmDelete(true)} />}
        onSaved={(_id, _total, warning) => {
          haptic()
          toast(warning ?? 'Changes saved')
          navigate(-1)
        }}
        onCancel={() => navigate(-1)}
      />
      <ConfirmSheet
        open={confirmDelete}
        title="Delete this expense?"
        message="It will be removed along with its receipt images. This can't be undone."
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteExpense(id)
          toast('Expense deleted')
          navigate(-1)
        }}
      />
    </>
  )
}
